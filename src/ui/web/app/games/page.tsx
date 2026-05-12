"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import type { GameSummary } from "@/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea";

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
    <ScrollArea className="h-full">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl tracking-[0.08em] text-parchment-2">
            Games
          </h2>
          <Tooltip content="Settings">
            <Link
              href="/settings"
              aria-label="Settings"
              className="inline-flex items-center justify-center text-parchment-2/70 hover:text-ember transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 rounded-sm"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Link>
          </Tooltip>
        </div>
        {loading ? (
          <p className="text-parchment-2/60 mt-8 italic">Loading games…</p>
        ) : games.length === 0 ? (
          <div className="text-center mt-20">
            <p className="text-5xl mb-5" aria-hidden="true">🕯️</p>
            <h2 className="font-display text-xl mb-2 tracking-[0.08em] text-parchment">
              No games in session
            </h2>
            <p className="text-sm text-parchment-2/70">
              Light the candle in Discord with{" "}
              <code className="bg-ink-2 border border-gold/40 px-1.5 py-0.5 rounded text-ember font-mono">
                /iam
              </code>{" "}
              to begin.
            </p>
          </div>
        ) : (
          <div>
            <h3 className="font-display text-base mb-4 tracking-[0.08em] text-parchment-2">
              Active Games
            </h3>
            <div className="grid gap-3">
              {games.map((g) => {
                const href =
                  g.phase === "in_progress"
                    ? `/games/${encodeURIComponent(g.channelId)}/night`
                    : `/games/${encodeURIComponent(g.channelId)}`;
                const isNight = g.phase === "in_progress";
                const phaseLabel = isNight ? "Night" : "Role Assignment";
                const phaseIcon = isNight ? "🌙" : "☀️";
                const accent = isNight
                  ? "var(--color-ember)"
                  : "var(--color-gold)";
                return (
                  <Link
                    key={g.channelId}
                    href={href}
                    className="parchment block rounded-md pl-5 pr-5 py-4 transition-transform hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ borderLeft: `4px solid ${accent}` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-base tracking-wide text-[#2a1f12]">
                        {g.gameId}
                      </span>
                      <div className="flex items-center gap-3 text-sm text-[#4a3a26]">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true">{phaseIcon}</span>
                          <span className="font-display tracking-wide">
                            {phaseLabel}
                          </span>
                        </span>
                        <span className="text-[#6a5238]">·</span>
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
    </ScrollArea>
  );
}
