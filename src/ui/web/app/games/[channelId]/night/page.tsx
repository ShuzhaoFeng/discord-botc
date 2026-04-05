"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ChatMessage, NightDetail, NightPlayerInfo } from "@/types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function roleLabel(p: NightPlayerInfo): string {
  return p.roleId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PlayerSidebar({
  players,
  conversations,
  selectedId,
  onSelect,
}: {
  players: NightPlayerInfo[];
  conversations: Record<string, ChatMessage[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full w-64 shrink-0 border-r border-slate-700 bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-medium">
          Players
        </p>
      </div>
      <div className="overflow-y-auto flex-1">
        {players.map((p) => {
          const msgs = conversations[p.userId] ?? [];
          const isSelected = p.userId === selectedId;
          const lastMsg = msgs[msgs.length - 1];
          return (
            <button
              key={p.userId}
              onClick={() => onSelect(p.userId)}
              className={`w-full text-left px-4 py-3 border-b border-slate-800 transition-colors ${
                isSelected
                  ? "bg-indigo-950/60 border-l-2 border-l-indigo-500 pl-[14px]"
                  : "hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium text-sm truncate flex-1 ${
                    p.alive ? "text-slate-100" : "text-slate-500 line-through"
                  }`}
                >
                  {p.displayName}
                </span>
                {p.pending && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Awaiting response" />
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5 gap-2">
                <span className="text-xs text-slate-500 truncate">
                  {roleLabel(p)}
                  {!p.alive && " †"}
                </span>
                {p.promptKind && (
                  <span
                    className={`text-xs px-1.5 py-px rounded shrink-0 ${
                      p.promptKind === "action"
                        ? "bg-red-900/60 text-red-300"
                        : p.promptKind === "info"
                          ? "bg-blue-900/60 text-blue-300"
                          : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {p.promptKind}
                  </span>
                )}
              </div>
              {lastMsg && (
                <p className="text-xs text-slate-600 truncate mt-1">
                  {lastMsg.from === "bot" ? "↙ " : "↗ "}
                  {lastMsg.text.slice(0, 48)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatArea({
  player,
  messages,
}: {
  player: NightPlayerInfo | null;
  messages: ChatMessage[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!player) {
    return (
      <div className="flex items-center justify-center flex-1 text-slate-600 text-sm">
        Select a player to view their conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Chat header */}
      <div className="px-5 py-3 border-b border-slate-700 shrink-0 flex items-center gap-3">
        <span className="font-semibold text-slate-100">{player.displayName}</span>
        <span className="text-slate-500 text-sm">{roleLabel(player)}{!player.alive && " †"}</span>
        {player.pending && (
          <span className="ml-auto text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">
            awaiting response
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {messages.length === 0 ? (
          <p className="text-slate-600 text-sm text-center mt-12">
            No messages yet.
          </p>
        ) : (
          messages.map((msg, i) => {
            const isBot = msg.from === "bot";
            return (
              <div
                key={i}
                className={`flex flex-col ${isBot ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed ${
                    isBot
                      ? "bg-indigo-600/80 text-white rounded-br-md"
                      : "bg-slate-700 text-slate-100 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-xs text-slate-600 mt-1 px-1">
                  {isBot ? "Bot" : player.displayName} · {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function NightPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<NightDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchDetail() {
    try {
      const res = await fetch(`/api/night/${channelId}`);
      if (!res.ok) throw new Error("Game not found");
      const data = (await res.json()) as NightDetail;
      setDetail(data);
      setSelectedId((prev) => prev ?? data.players[0]?.userId ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();

    const es = new EventSource("/api/events");
    es.addEventListener("game-update", (e) => {
      const { channelId: updatedId } = JSON.parse(e.data) as {
        channelId: string;
      };
      if (updatedId === channelId) fetchDetail();
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [channelId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <p className="mb-4">{error ?? "Game not found or not in night phase."}</p>
        <button
          onClick={() => router.push("/games")}
          className="text-sm underline hover:text-slate-200"
        >
          ← Back to games
        </button>
      </div>
    );
  }

  const selectedPlayer =
    detail.players.find((p) => p.userId === selectedId) ?? null;
  const selectedMessages = selectedId
    ? (detail.conversations[selectedId] ?? [])
    : [];

  return (
    <div className="h-full flex flex-col">
      {/* Compact top bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-slate-700 bg-slate-850">
        <button
          onClick={() => router.push("/games")}
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          ←
        </button>
        <span className="font-semibold text-slate-200">{detail.gameId}</span>
        <span className="text-slate-500 text-sm">Night {detail.nightNumber}</span>
        {detail.nightStatus && (
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
            {detail.nightStatus.replace(/_/g, " ")}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-600">
          {detail.players.filter((p) => p.pending).length} pending ·{" "}
          {detail.players.filter((p) => p.alive).length} alive
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <PlayerSidebar
          players={detail.players}
          conversations={detail.conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ChatArea player={selectedPlayer} messages={selectedMessages} />
      </div>
    </div>
  );
}
