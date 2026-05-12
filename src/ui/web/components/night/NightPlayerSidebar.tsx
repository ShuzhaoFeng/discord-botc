import type { ChatMessage, NightPlayerInfo } from "@/types";
import { roleLabel, tintForRole } from "./utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea";

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
    <div className="flex flex-col h-full w-full bg-ink-2/40">
      <div className="px-4 py-2.5 border-b border-gold/30 shrink-0">
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-2/70 font-display">
          Players
        </p>
      </div>
      <ScrollArea className="flex-1">
        {players.map((player) => {
          const messages = conversations[player.userId] ?? [];
          const isSelected = player.userId === selectedId;
          const lastMessage = messages[messages.length - 1];
          const tint = tintForRole(player.roleId);

          return (
            <button
              key={player.userId}
              onClick={() => onSelect(player.userId)}
              style={{ borderLeft: `3px solid ${tint}` }}
              className={`parchment-row w-full text-left pl-3 pr-4 py-3 border-b border-gold/15 transition-colors ${
                isSelected ? "outline outline-1 outline-ember/70" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`token-disc shrink-0 transition-[filter,opacity] ${
                    player.alive ? "" : "grayscale opacity-40"
                  }`}
                  style={{
                    ["--token-tint" as string]: tint,
                    width: "1.5rem",
                    height: "1.5rem",
                  }}
                  aria-hidden="true"
                />
                <span
                  className={`font-medium text-sm truncate flex-1 ${
                    player.alive
                      ? "text-parchment"
                      : "text-parchment-2/40 line-through italic"
                  }`}
                >
                  {player.displayName}
                </span>
                {player.pending && (
                  <Tooltip content="Awaiting response">
                    <span
                      className="candle-flicker shrink-0 text-base leading-none"
                      aria-label="Awaiting response"
                    >
                      🕯️
                    </span>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center mt-0.5 gap-2 pl-8">
                <span
                  className={`flex-1 min-w-0 text-xs truncate font-display tracking-wide ${
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
                {player.promptKind && (
                  <span
                    className={`text-xs px-1.5 py-px rounded shrink-0 font-display tracking-wide ${
                      player.promptKind === "action"
                        ? "bg-demon/30 text-red-200 border border-demon/50"
                        : player.promptKind === "info"
                          ? "bg-townsfolk/30 text-blue-200 border border-townsfolk/50"
                          : "bg-ink-2 text-parchment-2 border border-gold/30"
                    }`}
                  >
                    {player.promptKind}
                  </span>
                )}
              </div>
              {lastMessage && (
                <p className="text-xs text-parchment-2/40 truncate mt-1 pl-8">
                  {lastMessage.from === "bot" ? "🦉 " : "✒️ "}
                  {lastMessage.text}
                </p>
              )}
            </button>
          );
        })}
      </ScrollArea>
    </div>
  );
}
