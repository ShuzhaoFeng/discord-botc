"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, NightPlayerInfo } from "@/types";
import { formatTime, roleLabel } from "./utils";

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
      <div className="flex items-center justify-center flex-1 text-slate-600 text-sm">
        Select a player to view their conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700 shrink-0 flex items-center gap-3">
        <span className="font-semibold text-slate-100">
          {player.displayName}
        </span>
        <span className="text-slate-500 text-sm">
          {roleLabel(player)}
          {!player.alive && " (dead)"}
        </span>
        {player.pending && (
          <span className="ml-auto text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">
            awaiting response
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {messages.length === 0 ? (
          <p className="text-slate-600 text-sm text-center mt-12">
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
                  className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed ${
                    isBot
                      ? "bg-indigo-600/80 text-white rounded-br-md"
                      : "bg-slate-700 text-slate-100 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-xs text-slate-600 mt-1 px-1">
                  {isBot ? "Bot" : player.displayName} |{" "}
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {stagedMessage !== undefined && onStagedChange && (
        <div className="shrink-0 border-t border-slate-700 bg-slate-900 px-4 py-3">
          <p className="text-xs text-slate-500 mb-2">
            Pending message to{" "}
            <span className="text-slate-300 font-medium">
              {player.displayName}
            </span>{" "}
            - edit freely before sending.
          </p>
          <textarea
            value={stagedMessage}
            onChange={(e) => onStagedChange(e.target.value)}
            rows={3}
            className="w-full text-sm bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-100 resize-none focus:outline-none focus:border-indigo-500 leading-relaxed placeholder:text-slate-600"
            placeholder="Message..."
          />
        </div>
      )}
    </div>
  );
}
