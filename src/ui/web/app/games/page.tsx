"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import type { GameSummary } from "@/types";

export default function GamesPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchGames() {
    try {
      const res = await fetch("/api/games");
      setGames(await res.json());
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGames();

    const es = new EventSource("/api/events");
    es.addEventListener("game-update", () => fetchGames());
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-300">Games</h2>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/80 rounded-sm"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
        {loading ? (
          <p className="text-slate-400 mt-8">Loading games…</p>
        ) : games.length === 0 ? (
          <div className="text-center mt-20 text-slate-400">
            <p className="text-5xl mb-5">🎲</p>
            <h2 className="text-xl font-semibold mb-2 text-slate-300">
              No active games
            </h2>
            <p className="text-sm">
              Start a manual-mode game with{" "}
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                /iam
              </code>{" "}
              in Discord to begin.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-slate-300">
              Active Games
            </h2>
            <div className="grid gap-3">
              {games.map((g) => {
                const href =
                  g.phase === "in_progress"
                    ? `/games/${encodeURIComponent(g.channelId)}/night`
                    : `/games/${encodeURIComponent(g.channelId)}`;
                const phaseLabel =
                  g.phase === "in_progress" ? "Night" : "Role Assignment";
                return (
                  <Link
                    key={g.channelId}
                    href={href}
                    className="block bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg px-5 py-4 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{g.gameId}</span>
                      <div className="flex items-center gap-3 text-sm text-slate-400">
                        <span
                          className={
                            g.phase === "in_progress"
                              ? "text-indigo-400"
                              : "text-slate-400"
                          }
                        >
                          {phaseLabel}
                        </span>
                        <span>{g.playerCount} players</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
