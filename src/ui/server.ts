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
import { ensureRuntime } from "../game/night";
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
import { GameState, Role } from "../game/types";

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
        ? validateDraft(state.draft, state.players)
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
    reconcileDraftDependencies(state.draft, state.players);
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players),
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
    reconcileDraftDependencies(state.draft, state.players);
    updateGame(state);
    res.json({
      draft: serializeDraft(state),
      validationError: validateDraft(state.draft, state.players),
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
      validationError: validateDraft(state.draft, state.players),
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
      validationError: validateDraft(state.draft, state.players),
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
      validationError: validateDraft(state.draft, state.players),
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
      const validErr = validateDraft(state.draft, state.players);
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

    res.json({
      channelId: state.channelId,
      gameId: state.gameId,
      phase: state.phase,
      nightNumber: runtime.nightNumber,
      nightStatus: session?.status ?? null,
      players,
      conversations: getConversations(state.channelId),
    });
  });

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
