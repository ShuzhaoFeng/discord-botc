import type { ChatMessage, NightPlayerInfo } from "@/types";
import { roleLabel } from "./utils";

interface NightPlayerSidebarProps {
  players: NightPlayerInfo[];
  conversations: Record<string, ChatMessage[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function NightPlayerSidebar({
  players,
  conversations,
  selectedId,
  onSelect,
}: NightPlayerSidebarProps) {
  return (
    <div className="flex flex-col h-full w-64 shrink-0 border-r border-slate-700 bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-medium">
          Players
        </p>
      </div>
      <div className="overflow-y-auto flex-1">
        {players.map((player) => {
          const messages = conversations[player.userId] ?? [];
          const isSelected = player.userId === selectedId;
          const lastMessage = messages[messages.length - 1];

          return (
            <button
              key={player.userId}
              onClick={() => onSelect(player.userId)}
              className={`w-full text-left px-4 py-3 border-b border-slate-800 transition-colors ${
                isSelected
                  ? "bg-indigo-950/60 border-l-2 border-l-indigo-500 pl-[14px]"
                  : "hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium text-sm truncate flex-1 ${
                    player.alive
                      ? "text-slate-100"
                      : "text-slate-500 line-through"
                  }`}
                >
                  {player.displayName}
                </span>
                {player.pending && (
                  <span
                    className="w-2 h-2 rounded-full bg-yellow-400 shrink-0"
                    title="Awaiting response"
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5 gap-2">
                <span className="text-xs text-slate-500 truncate">
                  {roleLabel(player)}
                  {!player.alive && " (dead)"}
                </span>
                {player.promptKind && (
                  <span
                    className={`text-xs px-1.5 py-px rounded shrink-0 ${
                      player.promptKind === "action"
                        ? "bg-red-900/60 text-red-300"
                        : player.promptKind === "info"
                          ? "bg-blue-900/60 text-blue-300"
                          : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {player.promptKind}
                  </span>
                )}
              </div>
              {lastMessage && (
                <p className="text-xs text-slate-600 truncate mt-1">
                  {lastMessage.from === "bot" ? "BOT: " : "YOU: "}
                  {lastMessage.text.slice(0, 48)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
