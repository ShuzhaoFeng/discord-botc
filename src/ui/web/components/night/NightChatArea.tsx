"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, NightPlayerInfo } from "@/types";
import { formatTime, roleLabel } from "./utils";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface NightChatAreaProps {
  player: NightPlayerInfo | null;
  messages: ChatMessage[];
  stagedMessage?: string;
  onStagedChange?: (msg: string) => void;
}

export default function NightChatArea({
  player,
  messages,
  stagedMessage,
  onStagedChange,
}: NightChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!player) {
    return (
      <div className="flex items-center justify-center h-full w-full text-parchment-2/40 text-sm italic">
        Select a player to view their conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="px-5 py-3 border-b border-gold/30 shrink-0 flex items-center gap-3">
        <span
          className={`font-display tracking-wide ${
            player.alive
              ? "text-parchment"
              : "text-parchment-2/50 line-through italic"
          }`}
        >
          {player.displayName}
        </span>
        <span
          className={`text-sm ${
            player.alive
              ? "text-parchment-2/60"
              : "text-parchment-2/40 italic"
          }`}
        >
          {!player.alive && (
            <span className="mr-1" aria-hidden="true">
              💀
            </span>
          )}
          {roleLabel(player)}
        </span>
        {player.pending && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ember bg-ember/15 border border-ember/40 px-2 py-0.5 rounded-full font-display tracking-wide">
            <span className="candle-flicker leading-none" aria-hidden="true">
              🕯️
            </span>
            awaiting response
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-4">
          {messages.length === 0 ? (
          <p className="text-parchment-2/40 text-sm text-center mt-12 italic">
            No messages yet.
          </p>
        ) : (
          messages.map((msg, index) => {
            const isBot = msg.from === "bot";
            return (
              <div
                key={index}
                className={`flex flex-col ${isBot ? "items-end" : "items-start"}`}
              >
                <div
                  className={`parchment max-w-[70%] px-4 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed ${
                    isBot
                      ? "rounded-2xl rounded-br-md"
                      : "rounded-2xl rounded-bl-md"
                  }`}
                  style={{
                    borderLeft: isBot
                      ? undefined
                      : "3px solid var(--color-ember)",
                    borderRight: isBot
                      ? "3px solid var(--color-gold)"
                      : undefined,
                  }}
                >
                  {msg.text}
                </div>
                <span className="text-xs text-parchment-2/50 mt-1 px-1 inline-flex items-center gap-1.5">
                  <span aria-hidden="true">{isBot ? "🦉" : "✒️"}</span>
                  {isBot ? "Bot" : player.displayName}
                  <span className="text-parchment-2/30">·</span>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {stagedMessage !== undefined && onStagedChange && (
        <div className="shrink-0 border-t border-gold/30 bg-ink-2/60 px-4 py-3">
          <p className="text-xs text-parchment-2/60 mb-2">
            Pending message to{" "}
            <span className="text-parchment font-medium">
              {player.displayName}
            </span>{" "}
            — edit freely before sending.
          </p>
          <textarea
            value={stagedMessage}
            onChange={(e) => onStagedChange(e.target.value)}
            rows={3}
            className="w-full text-sm bg-ink-2 border border-gold/40 rounded-lg px-3 py-2.5 text-parchment resize-none focus:outline-none focus:border-ember leading-relaxed placeholder:text-parchment-2/30"
            placeholder="Message..."
          />
        </div>
      )}
    </div>
  );
}
