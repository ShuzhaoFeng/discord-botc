/**
 * Admin UI server.
 *
 * Runs Express (REST API + SSE) and Next.js (frontend) in a single process:
 *   - /api/*  → Express routes with direct in-memory game state access
 *   - /*      → Next.js (serves the React/Tailwind admin UI)
 */

import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import createNext from "next";
import { Client } from "discord.js";
import { getAllGames, getGame, updateGame, setUpdateHook } from "../game/state";
import { getConversations, setChatUpdateHook } from "../utils/chat-log";
import {
  ensureRuntime,
  applyInfoDraftFieldForUI,
  sendActionMessagesForUI,
  sendInfoMessagesForUI,
  sendDeathNarrativeConfirmationsForUI,
  applyDeathNarrativeDraftFieldForUI,
} from "../game/night";
import { getScript } from "../game/roles";
import { ALL_ROLE_DEFINITIONS } from "../roles";
import {
  swapRoles,
  setRole,
  validateDraft,
  reconcileDraftDependencies,
  ValidationError,
} from "../game/assignment";
import { distributeRoles } from "../handlers/role_sender";
import { GameState, Lang, Role } from "../game/types";
import {
  getGuildDefaultLang,
  setGuildDefaultLang,
  getGuildDrunkOverlap,
  setGuildDrunkOverlap,
} from "../i18n";

// ─── SSE ─────────────────────────────────────────────────────────────────────

const sseClients = new Set<Response>();

function broadcastUpdate(channelId: string): void {
  const payload = JSON.stringify({ channelId });
  for (const client of sseClients) {
    client.write(`event: game-update\ndata: ${payload}\n\n`);
  }
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeDraft(state: GameState) {
  if (!state.draft) return null;
  const { draft, players } = state;
  return {
    assignments: players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      seatIndex: p.seatIndex,
      role: draft.assignments.get(p.userId)!,
    })),
    drunkFakeRole: draft.drunkFakeRole,
    redHerring: draft.redHerring,
    impBluffs: draft.impBluffs,
  };
}

function getAllRoles() {
  return getScript().roles.map((r) => {
    const def = ALL_ROLE_DEFINITIONS.find((d) => d.id === r.id);
    return { id: r.id, category: r.category, name: def?.name.en ?? r.id };
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

export async function startUiServer(
  client: Client,
  port = 3000,
): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";
  // Resolves to src/ui/web/ from both ts-node (src/ui/) and compiled (dist/ui/)
  const webDir = path.resolve(__dirname, "../../src/ui/web");

  const nextApp = createNext({ dev: isDev, dir: webDir });

  await nextApp.prepare();

  const handle = nextApp.getRequestHandler();
  const handleUpgrade = nextApp.getUpgradeHandler();

  const app = express();
  app.use(express.json());

  // Fire SSE whenever any game state changes or a chat message is logged.
  setUpdateHook((state) => broadcastUpdate(state.channelId));
  setChatUpdateHook((channelId) => broadcastUpdate(channelId));

  // ── SSE ──────────────────────────────────────────────────────────────────

  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    res.write("event: connected\ndata: {}\n\n");
  });

  // ── Game list ─────────────────────────────────────────────────────────────

  app.get("/api/games", (_req: Request, res: Response) => {
    const list = getAllGames()
      .filter(
        (g) =>
          (g.phase === "role_assignment" || g.phase === "in_progress") &&
          g.mode === "manual",
      )
      .map((g) => ({
        channelId: g.channelId,
        gameId: g.gameId,
        phase: g.phase,
        playerCount: g.players.length,
      }));
    res.json(list);
  });

  // ── Settings: language defaults ──────────────────────────────────────────

  app.get(
    "/api/settings/language/guilds",
    async (_req: Request, res: Response) => {
      const rows = await Promise.all(
        client.guilds.cache.map(async (g) => {
          let name = g.name;
          try {
            const full = await g.fetch();
            name = full.name;
          } catch {
            // Keep cache name if fetch fails.
          }
          return {
            guildId: g.id,
            guildName: name,
            defaultLang: getGuildDefaultLang(g.id),
            drunkOverlap: getGuildDrunkOverlap(g.id),
          };
        }),
      );
      rows.sort((a, b) => a.guildName.localeCompare(b.guildName));
      res.json({ guilds: rows });
    },
  );

  app.post("/api/settings/language", (req: Request, res: Response) => {
    const { guildId, lang } = req.body as {
      guildId?: string;
      lang?: string;
    };

    if (!guildId || typeof guildId !== "string") {
      return void res.status(400).json({ error: "guildId is required" });
    }
    if (!client.guilds.cache.has(guildId)) {
      return void res.status(404).json({ error: "Guild not found" });
    }
    if (lang !== "en" && lang !== "zh") {
      return void res.status(400).json({ error: "lang must be en or zh" });
    }

    setGuildDefaultLang(guildId, lang as Lang);
    res.json({ ok: true, guildId, defaultLang: getGuildDefaultLang(guildId) });
  });

  app.post("/api/settings/drunk-overlap", (req: Request, res: Response) => {
    const { guildId, drunkOverlap } = req.body as {
      guildId?: string;
      drunkOverlap?: unknown;
    };

    if (!guildId || typeof guildId !== "string") {
      return void res.status(400).json({ error: "guildId is required" });
    }
    if (!client.guilds.cache.has(guildId)) {
      return void res.status(404).json({ error: "Guild not found" });
    }
    if (typeof drunkOverlap !== "boolean") {
      return void res
        .status(400)
        .json({ error: "drunkOverlap must be a boolean" });
    }

    setGuildDrunkOverlap(guildId, drunkOverlap);
    res.json({ ok: true, guildId, drunkOverlap: getGuildDrunkOverlap(guildId) });
  });

  // ── Game detail ───────────────────────────────────────────────────────────

  app.get("/api/games/:channelId", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state) return void res.status(404).json({ error: "Game not found" });
    if (state.phase !== "role_assignment" || state.mode !== "manual") {
      return void res
        .status(400)
        .json({ error: "Game not in manual role_assignment phase" });
    }
    res.json({
      channelId: state.channelId,
      gameId: state.gameId,
      draft: serializeDraft(state),
      allRoles: getAllRoles(),
      validationError: state.draft
        ? validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId))
        : null,
    });
  });

  // ── Swap ──────────────────────────────────────────────────────────────────

  app.post("/api/games/:channelId/swap", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state?.draft)
      return void res.status(404).json({ error: "Game not found" });
    const { userId1, userId2 } = req.body as {
      userId1: string;
      userId2: string;
    };
    swapRoles(state.draft, userId1, userId2);
    reconcileDraftDependencies(state.draft, state.players, getGuildDrunkOverlap(state.guildId));
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId)),
    });
  });

  // ── Set role ──────────────────────────────────────────────────────────────

  app.post("/api/games/:channelId/role", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state?.draft)
      return void res.status(404).json({ error: "Game not found" });
    const { userId, roleId } = req.body as { userId: string; roleId: string };
    const newRole = getScript().roles.find((r) => r.id === roleId);
    if (!newRole)
      return void res.status(400).json({ error: `Unknown role: ${roleId}` });
    const result = setRole(state.draft, state.players, userId, newRole);
    if ("key" in result && !("adjustedSlots" in result)) {
      const ve = result as ValidationError;
      return void res
        .status(400)
        .json({ error: ve.key, params: ve.params, userFacing: true });
    }
    reconcileDraftDependencies(state.draft, state.players, getGuildDrunkOverlap(state.guildId));
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId)),
    });
  });

  // ── Red herring ───────────────────────────────────────────────────────────

  app.post("/api/games/:channelId/herring", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state?.draft)
      return void res.status(404).json({ error: "Game not found" });
    const { userId } = req.body as { userId: string };
    const role = state.draft.assignments.get(userId);
    if (!role) return void res.status(400).json({ error: "Player not found" });
    if (role.category === "Demon" || role.category === "Minion") {
      return void res
        .status(400)
        .json({ error: "Red herring must be a Good player" });
    }
    state.draft.redHerring = userId;
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId)),
    });
  });

  // ── Drunk fake role ───────────────────────────────────────────────────────

  app.post("/api/games/:channelId/drunk", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state?.draft)
      return void res.status(404).json({ error: "Game not found" });
    const { roleId } = req.body as { roleId: string };
    const role = getScript().roles.find((r) => r.id === roleId);
    if (!role || role.category !== "Townsfolk") {
      return void res
        .status(400)
        .json({ error: "Drunk fake role must be a Townsfolk role" });
    }
    state.draft.drunkFakeRole = role;
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId)),
    });
  });

  // ── Imp bluffs ────────────────────────────────────────────────────────────

  app.post("/api/games/:channelId/bluffs", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state?.draft)
      return void res.status(404).json({ error: "Game not found" });
    const { roleIds } = req.body as { roleIds: string[] };
    if (!Array.isArray(roleIds) || roleIds.length !== 3) {
      return void res
        .status(400)
        .json({ error: "Exactly 3 role IDs required" });
    }
    const usedIds = new Set(
      [...state.draft.assignments.values()].map((r) => r.id),
    );
    const bluffs: Role[] = [];
    for (const id of roleIds) {
      const role = getScript().roles.find((r) => r.id === id);
      if (!role || role.category !== "Townsfolk") {
        return void res
          .status(400)
          .json({ error: `${id} is not a Townsfolk role` });
      }
      if (usedIds.has(id)) {
        return void res
          .status(400)
          .json({ error: `${id} is already assigned` });
      }
      bluffs.push(role);
    }
    if (new Set(roleIds).size !== 3) {
      return void res
        .status(400)
        .json({ error: "Bluff roles must be distinct" });
    }
    state.draft.impBluffs = [bluffs[0], bluffs[1], bluffs[2]];
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId)),
    });
  });

  // ── Confirm draft ─────────────────────────────────────────────────────────

  app.post(
    "/api/games/:channelId/confirm",
    async (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state?.draft)
        return void res.status(404).json({ error: "Game not found" });
      if (state.mode !== "manual")
        return void res
          .status(400)
          .json({ error: "Only manual mode games can be confirmed here" });
      const validErr = validateDraft(state.draft, state.players, getGuildDrunkOverlap(state.guildId));
      if (validErr)
        return void res
          .status(400)
          .json({ error: validErr.key, params: validErr.params });
      try {
        await distributeRoles(client, state);
        res.json({ ok: true });
      } catch (err) {
        console.error("[UI] Error distributing roles:", err);
        res.status(500).json({ error: "Failed to distribute roles" });
      }
    },
  );

  // ── Night monitor ─────────────────────────────────────────────────────────

  app.get("/api/night/:channelId", (req: Request, res: Response) => {
    const state = getGame(req.params.channelId as string);
    if (!state || state.mode !== "manual") {
      return void res.status(404).json({ error: "Game not found" });
    }
    if (state.phase !== "in_progress" && state.phase !== "ended") {
      return void res.status(400).json({ error: "Game not in night phase" });
    }

    const runtime = ensureRuntime(state);
    const session = runtime.nightSession;

    const players = runtime.playerStates.map((ps) => ({
      userId: ps.player.userId,
      displayName: ps.player.displayName,
      roleId: ps.role.id,
      alive: ps.alive,
      pending: session?.pendingPlayerIds.includes(ps.player.userId) ?? false,
      promptKind: session?.prompts.get(ps.player.userId)?.kind ?? null,
    }));

    // Control panel: action messages (phase 1)
    let actionMessages:
      | { userId: string; displayName: string; message: string }[]
      | undefined;
    if (session?.status === "awaiting_storyteller_action") {
      actionMessages = runtime.playerStates
        .filter((ps) => ps.alive)
        .map((ps) => ({
          userId: ps.player.userId,
          displayName: ps.player.displayName,
          message: session.actionMessages.get(ps.player.userId) ?? "",
        }));
    }

    // Control panel: info messages with draft fields (phase 3)
    let infoMessages:
      | {
          userId: string;
          displayName: string;
          message: string;
          metaKind: "randomized" | "fixed";
          reasonKey?: string;
          draft?: {
            templateId: string;
            fields: Record<string, string | number | boolean>;
            fieldTypes: Record<string, string>;
            constraints?: Record<string, string | number | boolean>;
            allowArbitraryOverride?: boolean;
          };
        }[]
      | undefined;
    if (session?.status === "awaiting_storyteller_info") {
      infoMessages = state.players
        .filter((p) => session.infoMessages.has(p.userId))
        .map((p) => {
          const message = session.infoMessages.get(p.userId) ?? "";
          const meta = session.infoOutcomeMeta.get(p.userId);
          const draft = session.infoOutcomeDrafts.get(p.userId);
          return {
            userId: p.userId,
            displayName: p.displayName,
            message,
            metaKind: meta?.kind ?? "fixed",
            reasonKey: meta?.reasonKey,
            draft: draft
              ? {
                  templateId: draft.templateId,
                  fields: { ...draft.fields } as Record<
                    string,
                    string | number | boolean
                  >,
                  fieldTypes: { ...draft.fieldTypes },
                  constraints: draft.constraints
                    ? ({ ...draft.constraints } as Record<
                        string,
                        string | number | boolean
                      >)
                    : undefined,
                  allowArbitraryOverride: draft.allowArbitraryOverride,
                }
              : undefined,
          };
        });
    }

    // Control panel: death narrative confirmations (phase 4)
    let deathConfirmEntries:
      | {
          userId: string;
          displayName: string;
          kind: "simple" | "ravenkeeper";
          response: string;
          confirmation: string;
          draft?: {
            fields: Record<string, string>;
            fieldTypes: Record<string, "role" | "player">;
          };
        }[]
      | undefined;
    if (session?.status === "awaiting_storyteller_death_confirm") {
      deathConfirmEntries = [];
      for (const [userId, kind] of session.deathNarrativePlayers.entries()) {
        const player = state.players.find((p) => p.userId === userId);
        if (!player) continue;
        const d = session.deathNarrativeDrafts.get(userId);
        deathConfirmEntries.push({
          userId,
          displayName: player.displayName,
          kind,
          response: session.deathNarrativeResponses.get(userId) ?? "",
          confirmation: session.deathNarrativeConfirmations.get(userId) ?? "",
          draft: d
            ? {
                fields: Object.fromEntries(
                  Object.keys(d.fieldTypes).map((k) => [k, d.fields[k]]),
                ),
                fieldTypes: { ...d.fieldTypes },
              }
            : undefined,
        });
      }
    }

    // Always include player/role lists for dropdowns in control panel
    const allPlayers = state.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
    }));
    const scriptRoles = getScript().roles.map((r) => {
      const def = ALL_ROLE_DEFINITIONS.find((d) => d.id === r.id);
      return { id: r.id, name: def?.name.en ?? r.id };
    });

    res.json({
      channelId: state.channelId,
      gameId: state.gameId,
      phase: state.phase,
      nightNumber: runtime.nightNumber,
      nightStatus: session?.status ?? null,
      players,
      conversations: getConversations(state.channelId),
      actionMessages,
      infoMessages,
      deathConfirmEntries,
      allPlayers,
      scriptRoles,
    });
  });

  // ── Night: set draft field ────────────────────────────────────────────────

  app.post(
    "/api/night/:channelId/set-draft-field",
    (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state || state.mode !== "manual") {
        return void res.status(404).json({ error: "Game not found" });
      }
      const { playerId, field, value } = req.body as {
        playerId?: string;
        field?: string;
        value?: string | number | boolean;
      };
      if (!playerId || !field || value === undefined) {
        return void res
          .status(400)
          .json({ error: "playerId, field, and value are required" });
      }
      const result = applyInfoDraftFieldForUI(state, playerId, field, value);
      if ("error" in result) {
        return void res.status(400).json({ error: result.error });
      }
      res.json({ message: result.message });
    },
  );

  // ── Night: send action messages ───────────────────────────────────────────

  app.post(
    "/api/night/:channelId/send-action",
    async (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state || state.mode !== "manual") {
        return void res.status(404).json({ error: "Game not found" });
      }
      const { messages } = req.body as { messages?: Record<string, string> };
      if (!messages || typeof messages !== "object") {
        return void res
          .status(400)
          .json({ error: "messages object is required" });
      }
      const result = await sendActionMessagesForUI(client, state, messages);
      if (!result.ok) {
        return void res.status(400).json({ error: result.error });
      }
      res.json({ ok: true });
    },
  );

  // ── Night: send info messages ─────────────────────────────────────────────

  app.post(
    "/api/night/:channelId/send-info",
    async (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state || state.mode !== "manual") {
        return void res.status(404).json({ error: "Game not found" });
      }
      const { messages } = req.body as { messages?: Record<string, string> };
      if (!messages || typeof messages !== "object") {
        return void res
          .status(400)
          .json({ error: "messages object is required" });
      }
      const result = await sendInfoMessagesForUI(client, state, messages);
      if (!result.ok) {
        return void res.status(400).json({ error: result.error });
      }
      res.json({ ok: true });
    },
  );

  // ── Night: update death narrative draft field ─────────────────────────────

  app.post(
    "/api/night/:channelId/set-death-draft-field",
    (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state || state.mode !== "manual") {
        return void res.status(404).json({ error: "Game not found" });
      }
      const { playerId, field, value } = req.body as {
        playerId?: string;
        field?: string;
        value?: string;
      };
      if (!playerId || !field || value === undefined) {
        return void res
          .status(400)
          .json({ error: "playerId, field, and value are required" });
      }
      const result = applyDeathNarrativeDraftFieldForUI(state, playerId, field, value);
      if ("error" in result) {
        return void res.status(400).json({ error: result.error });
      }
      res.json({ confirmation: result.confirmation });
    },
  );

  // ── Night: send death narrative confirmations ─────────────────────────────

  app.post(
    "/api/night/:channelId/send-death-confirm",
    async (req: Request, res: Response) => {
      const state = getGame(req.params.channelId as string);
      if (!state || state.mode !== "manual") {
        return void res.status(404).json({ error: "Game not found" });
      }
      const { messages = {} } = req.body as { messages?: Record<string, string> };
      const result = await sendDeathNarrativeConfirmationsForUI(client, state, messages);
      if (!result.ok) {
        return void res.status(400).json({ error: result.error });
      }
      res.json({ ok: true });
    },
  );

  // ── Delegate everything else to Next.js ───────────────────────────────────

  app.use((req, res) => handle(req, res));

  const server = http.createServer(app);

  // Forward WebSocket upgrades to Next.js (HMR in dev mode)
  server.on("upgrade", async (req, socket, head) => {
    await handleUpgrade(req, socket, head);
  });

  server.listen(port, () => {
    console.log(`🌐 Admin UI running at http://localhost:${port}`);
  });
}
