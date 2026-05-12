"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PlayerTable from "@/components/PlayerTable";
import DerivedFields from "@/components/DerivedFields";
import ConfirmBar from "@/components/ConfirmBar";
import ClockTowerPanel from "@/components/ClockTowerPanel";
import type { ConfirmResponse, DraftUpdateResponse, GameDetail } from "@/types";
import { ArrowLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Tooltip } from "@/components/ui/Tooltip";

export default function GamePage() {
  const { channelId } = useParams<{ channelId: string }>();
  const router = useRouter();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [startNightLoading, setStartNightLoading] = useState(false);
  const [clocktowerJson, setClocktowerJson] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 6000);
  }

  function applyUpdate(data: DraftUpdateResponse) {
    setGame((prev) =>
      prev
        ? { ...prev, draft: data.draft, validationError: data.validationError }
        : prev,
    );
  }

  async function post(
    path: string,
    body: object,
  ): Promise<DraftUpdateResponse> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data as DraftUpdateResponse;
  }

  const handleSwap = useCallback(
    async (userId1: string, userId2: string) => {
      try {
        applyUpdate(
          await post(`/api/games/${channelId}/swap`, { userId1, userId2 }),
        );
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleRoleChange = useCallback(
    async (userId: string, roleId: string) => {
      try {
        applyUpdate(
          await post(`/api/games/${channelId}/role`, { userId, roleId }),
        );
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleHerring = useCallback(
    async (userId: string) => {
      try {
        applyUpdate(await post(`/api/games/${channelId}/herring`, { userId }));
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleDrunk = useCallback(
    async (roleId: string) => {
      try {
        applyUpdate(await post(`/api/games/${channelId}/drunk`, { roleId }));
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleBluffs = useCallback(
    async (roleIds: [string, string, string]) => {
      try {
        applyUpdate(await post(`/api/games/${channelId}/bluffs`, { roleIds }));
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleConfirm = useCallback(async () => {
    setConfirmLoading(true);
    try {
      if (game?.townsquareUrl) {
        // Two-phase: get clocktower JSON, pause for export
        const res = await fetch(`/api/games/${channelId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = (await res.json()) as ConfirmResponse;
        if (!res.ok)
          throw new Error(
            (data as unknown as { error?: string }).error ??
              "Failed to confirm",
          );
        setClocktowerJson(data.clocktowerJson);
      } else {
        // Direct: distribute roles and go straight to night
        const res = await fetch(`/api/games/${channelId}/start-night`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to confirm");
        router.push("/games");
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmLoading(false);
    }
  }, [channelId, game?.townsquareUrl, router]);

  const handleStartNight = useCallback(async () => {
    setStartNightLoading(true);
    try {
      const res = await fetch(`/api/games/${channelId}/start-night`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start night");
      router.push("/games");
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setStartNightLoading(false);
    }
  }, [channelId, router]);

  useEffect(() => {
    async function loadGame() {
      try {
        const res = await fetch(`/api/games/${channelId}`);
        if (!res.ok) throw new Error("Game not found");
        setGame(await res.json());
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    }

    loadGame();

    const es = new EventSource("/api/events");
    es.addEventListener("game-update", async (e) => {
      const { channelId: updatedId } = JSON.parse(e.data) as {
        channelId: string;
      };
      if (updatedId !== channelId) return;
      const res = await fetch(`/api/games/${channelId}`);
      if (res.ok) {
        setGame(await res.json());
      } else {
        router.push("/games");
      }
    });
    es.onerror = () => es.close();

    return () => {
      es.close();
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [channelId, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-parchment-2/60 italic">
        Loading…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-parchment-2/70">
        <p className="mb-4 italic">
          Game not found or not in role assignment phase.
        </p>
        <button
          onClick={() => router.push("/games")}
          className="inline-flex items-center gap-1.5 text-sm text-parchment-2/80 hover:text-ember underline underline-offset-2 transition-colors"
        >
          <ArrowLeft size={16} /> Back to games
        </button>
      </div>
    );
  }

  if (clocktowerJson) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-gold/30 bg-ink-2/40">
          <span className="font-display tracking-wide text-parchment">
            {game.gameId}
          </span>
          <span className="inline-flex items-center gap-1.5 text-fabled text-sm font-display tracking-wide">
            <span aria-hidden="true">✓</span> Roles Confirmed
          </span>
          <span className="text-xs text-parchment-2/70 bg-ink-2 border border-gold/30 px-2 py-0.5 rounded font-display tracking-wide">
            {game.draft.assignments.length} players
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <ClockTowerPanel
            clocktowerJson={clocktowerJson}
            onStartNight={handleStartNight}
            isStartNightLoading={startNightLoading}
            error={error}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-gold/30 bg-ink-2/40">
        <Tooltip content="Back to games">
          <button
            onClick={() => router.push("/games")}
            aria-label="Back to games"
            className="text-parchment-2/60 hover:text-ember text-sm transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
        </Tooltip>
        <span className="font-display tracking-wide text-parchment">
          {game.gameId}
        </span>
        <span className="inline-flex items-center gap-1.5 text-parchment-2/70 text-sm font-display tracking-wide">
          <span aria-hidden="true">☀️</span> Role Assignment
        </span>
        <span className="text-xs text-parchment-2/70 bg-ink-2 border border-gold/30 px-2 py-0.5 rounded font-display tracking-wide">
          {game.draft.assignments.length} players
        </span>
        {error && (
          <span className="ml-2 wax-seal text-xs px-2 py-0.5 rounded truncate inline-flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span>
            {error}
          </span>
        )}
        <span className="ml-auto text-xs text-parchment-2/50 italic">
          drag ⠿ to swap seats
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden border-r border-gold/30">
          <PlayerTable
            assignments={game.draft.assignments}
            allRoles={game.allRoles}
            onSwap={handleSwap}
            onRoleChange={handleRoleChange}
          />
        </div>

        <div className="w-72 shrink-0 flex flex-col bg-ink-2/40">
          <div className="px-4 py-2.5 border-b border-gold/30 shrink-0">
            <p className="text-xs uppercase tracking-[0.18em] text-parchment-2/70 font-display">
              Configuration
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <DerivedFields
                draft={game.draft}
                allRoles={game.allRoles}
                onHerringChange={handleHerring}
                onDrunkChange={handleDrunk}
                onBluffsChange={handleBluffs}
              />
            </div>
          </ScrollArea>
          <div className="shrink-0 p-4 border-t border-gold/30">
            <ConfirmBar
              validationError={game.validationError}
              onConfirm={handleConfirm}
              isLoading={confirmLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
