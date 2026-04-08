"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PlayerTable from "@/components/PlayerTable";
import DerivedFields from "@/components/DerivedFields";
import ConfirmBar from "@/components/ConfirmBar";
import ClockTowerPanel from "@/components/ClockTowerPanel";
import type { ConfirmResponse, DraftUpdateResponse, GameDetail } from "@/types";

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
        applyUpdate(
          await post(`/api/games/${channelId}/herring`, { userId }),
        );
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
        applyUpdate(
          await post(`/api/games/${channelId}/bluffs`, { roleIds }),
        );
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : String(e));
      }
    },
    [channelId],
  );

  const handleConfirm = useCallback(async () => {
    setConfirmLoading(true);
    try {
      const res = await fetch(`/api/games/${channelId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as ConfirmResponse;
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "Failed to confirm");
      setClocktowerJson(data.clocktowerJson);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmLoading(false);
    }
  }, [channelId]);

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
      <div className="h-full flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <p className="mb-4">Game not found or not in role assignment phase.</p>
        <button
          onClick={() => router.push("/games")}
          className="text-sm underline hover:text-slate-200"
        >
          ← Back to games
        </button>
      </div>
    );
  }

  if (clocktowerJson) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-slate-700">
          <span className="font-semibold text-slate-200">{game.gameId}</span>
          <span className="text-emerald-400 text-sm">Roles Confirmed</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
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
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-slate-700">
        <button
          onClick={() => router.push("/games")}
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          ←
        </button>
        <span className="font-semibold text-slate-200">{game.gameId}</span>
        <span className="text-slate-500 text-sm">Role Assignment</span>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
          {game.draft.assignments.length} players
        </span>
        {error && (
          <span className="ml-2 text-red-400 text-sm truncate">{error}</span>
        )}
        <span className="ml-auto text-xs text-slate-600">
          drag ⠿ to swap seats
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: player list */}
        <div className="flex-1 overflow-hidden border-r border-slate-700">
          <PlayerTable
            assignments={game.draft.assignments}
            allRoles={game.allRoles}
            onSwap={handleSwap}
            onRoleChange={handleRoleChange}
          />
        </div>

        {/* Right: derived fields + confirm */}
        <div className="w-72 shrink-0 flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-medium">
              Configuration
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <DerivedFields
              draft={game.draft}
              allRoles={game.allRoles}
              onHerringChange={handleHerring}
              onDrunkChange={handleDrunk}
              onBluffsChange={handleBluffs}
            />
          </div>
          <div className="shrink-0 p-4 border-t border-slate-700">
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
