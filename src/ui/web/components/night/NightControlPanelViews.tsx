import type { NightDetail, PlayerBasic, RoleBasic } from "@/types";
import {
  ActionMessageCard,
  DeathConfirmCard,
  InfoMessageCard,
} from "./NightControlPanelCards";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface StatusPanelProps {
  text: string;
}

export function StatusPanel({ text }: StatusPanelProps) {
  return (
    <div className="w-full bg-ink-2/40 flex items-center justify-center px-6">
      <p className="text-parchment-2/50 text-sm text-center italic">{text}</p>
    </div>
  );
}

export function AwaitingPlayersPanel({
  pendingCount,
}: {
  pendingCount: number;
}) {
  return (
    <div className="w-full bg-ink-2/40 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="candle-flicker text-2xl leading-none" aria-hidden="true">
        🕯️
      </span>
      <p className="text-parchment-2/70 text-sm">
        Waiting for {pendingCount} player{pendingCount !== 1 ? "s" : ""} to
        respond.
      </p>
    </div>
  );
}

export function AwaitingDeathNarrativePanel({
  pendingDead,
}: {
  pendingDead: { userId: string; displayName: string }[];
}) {
  return (
    <div className="w-full bg-ink-2/40 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-2xl leading-none animate-pulse" aria-hidden="true">
        💀
      </span>
      <p className="text-parchment-2/70 text-sm">
        Waiting for {pendingDead.length} dead player
        {pendingDead.length !== 1 ? "s" : ""} to describe their death…
      </p>
      {pendingDead.map((player) => (
        <span key={player.userId} className="text-xs text-parchment-2/50">
          {player.displayName}
        </span>
      ))}
    </div>
  );
}

interface StagingPanelProps {
  stagedMessages: Record<string, string>;
  allPlayers: PlayerBasic[];
  sendError: string | null;
  isSending: boolean;
  onBack: () => void;
  onSendAll: () => void;
}

export function StagingPanel({
  stagedMessages,
  allPlayers,
  sendError,
  isSending,
  onBack,
  onSendAll,
}: StagingPanelProps) {
  return (
    <div className="w-full bg-ink-2/40 flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gold/30 shrink-0 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-2/70 font-display">
          Staged
        </p>
        <button
          onClick={onBack}
          className="text-xs text-parchment-2/60 hover:text-ember transition-colors font-display tracking-wide"
        >
          ← Back
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-gold/30 bg-ember/10 shrink-0">
        <p className="text-xs text-ember leading-relaxed">
          Select a player on the left to edit their pending message.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {Object.entries(stagedMessages).map(([userId, msg]) => {
            const player = allPlayers.find((item) => item.userId === userId);
            return (
              <div
                key={userId}
                className="flex flex-col px-4 py-2 border-b border-gold/15"
              >
                <span className="text-xs font-display tracking-wide text-parchment">
                  {player?.displayName ?? userId}
                </span>
                <span className="text-xs text-parchment-2/50 truncate mt-0.5">
                  {msg.slice(0, 60) || "—"}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-gold/30 shrink-0">
        {sendError && (
          <p className="wax-seal text-xs mb-2 px-2 py-1 rounded inline-flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span>
            {sendError}
          </p>
        )}
        <button
          onClick={onSendAll}
          disabled={isSending}
          className="w-full py-2 font-display tracking-[0.1em] uppercase text-sm rounded transition-all disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg"
          style={{
            background:
              "linear-gradient(180deg, var(--color-ember) 0%, color-mix(in srgb, var(--color-ember) 70%, black) 100%)",
            color: "#1a1410",
            border: "1px solid var(--color-gold)",
            opacity: isSending ? 0.6 : 1,
          }}
        >
          {isSending ? "Sending…" : "Send All"}
        </button>
      </div>
    </div>
  );
}

interface TemplatePanelProps {
  detail: NightDetail;
  phaseLabel: string;
  isDeathConfirmPhase: boolean;
  isActionPhase: boolean;
  localInfoMessages: Record<string, string>;
  localDraftFields: Record<string, Record<string, string | number | boolean>>;
  localDeathConfirmMessages: Record<string, string>;
  localDeathDraftFields: Record<string, Record<string, string>>;
  allPlayers: PlayerBasic[];
  scriptRoles: RoleBasic[];
  onFieldChange: (
    userId: string,
    field: string,
    value: string | number | boolean,
  ) => void;
  onDeathDraftFieldChange: (
    userId: string,
    field: string,
    value: string,
  ) => void;
  onStageMessages: () => void;
}

export function TemplatePanel({
  detail,
  phaseLabel,
  isDeathConfirmPhase,
  isActionPhase,
  localInfoMessages,
  localDraftFields,
  localDeathConfirmMessages,
  localDeathDraftFields,
  allPlayers,
  scriptRoles,
  onFieldChange,
  onDeathDraftFieldChange,
  onStageMessages,
}: TemplatePanelProps) {
  return (
    <div className="w-full bg-ink-2/40 flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gold/30 shrink-0">
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-2/70 font-display">
          {phaseLabel}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {!isDeathConfirmPhase &&
            !isActionPhase &&
            (detail.infoMessages ?? []).length === 0 && (
              <div className="wax-seal px-3 py-2 rounded text-xs text-parchment-2/70">
                No info messages this night. Confirm to proceed.
              </div>
            )}
          {isDeathConfirmPhase
            ? (detail.deathConfirmEntries ?? []).map((entry) => (
                <DeathConfirmCard
                  key={entry.userId}
                  entry={entry}
                  localConfirmation={localDeathConfirmMessages[entry.userId]}
                  localFields={localDeathDraftFields[entry.userId]}
                  allPlayers={allPlayers}
                  scriptRoles={scriptRoles}
                  onFieldChange={onDeathDraftFieldChange}
                />
              ))
            : isActionPhase
              ? (detail.actionMessages ?? []).map((entry) => (
                  <ActionMessageCard key={entry.userId} entry={entry} />
                ))
              : (detail.infoMessages ?? []).map((entry) => (
                  <InfoMessageCard
                    key={entry.userId}
                    entry={entry}
                    localMessage={localInfoMessages[entry.userId]}
                    localFields={localDraftFields[entry.userId]}
                    allPlayers={allPlayers}
                    scriptRoles={scriptRoles}
                    onFieldChange={onFieldChange}
                  />
                ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-gold/30 shrink-0">
        <button
          onClick={onStageMessages}
          className="w-full py-2 font-display tracking-[0.1em] uppercase text-sm rounded transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg"
          style={{
            background:
              "linear-gradient(180deg, var(--color-ember) 0%, color-mix(in srgb, var(--color-ember) 70%, black) 100%)",
            color: "#1a1410",
            border: "1px solid var(--color-gold)",
          }}
        >
          Confirm Messages
        </button>
      </div>
    </div>
  );
}
