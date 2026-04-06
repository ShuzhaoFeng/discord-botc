import type { NightDetail, PlayerBasic, RoleBasic } from "@/types";
import {
  ActionMessageCard,
  DeathConfirmCard,
  InfoMessageCard,
} from "./NightControlPanelCards";

interface StatusPanelProps {
  text: string;
}

export function StatusPanel({ text }: StatusPanelProps) {
  return (
    <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex items-center justify-center px-6">
      <p className="text-slate-600 text-sm text-center">{text}</p>
    </div>
  );
}

export function AwaitingPlayersPanel({
  pendingCount,
}: {
  pendingCount: number;
}) {
  return (
    <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
      <p className="text-slate-400 text-sm">
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
    <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="w-3 h-3 rounded-full bg-rose-400 animate-pulse" />
      <p className="text-slate-400 text-sm">
        Waiting for {pendingDead.length} dead player
        {pendingDead.length !== 1 ? "s" : ""} to describe their death...
      </p>
      {pendingDead.map((player) => (
        <span key={player.userId} className="text-xs text-slate-500">
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
    <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-medium">
          Staged
        </p>
        <button
          onClick={onBack}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Back
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-slate-700 bg-indigo-950/30 shrink-0">
        <p className="text-xs text-indigo-400 leading-relaxed">
          Select a player on the left to edit their pending message.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(stagedMessages).map(([userId, msg]) => {
          const player = allPlayers.find((item) => item.userId === userId);
          return (
            <div
              key={userId}
              className="flex flex-col px-4 py-2 border-b border-slate-800/60"
            >
              <span className="text-xs font-medium text-slate-300">
                {player?.displayName ?? userId}
              </span>
              <span className="text-xs text-slate-600 truncate mt-0.5">
                {msg.slice(0, 60) || "-"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-700 shrink-0">
        {sendError && <p className="text-red-400 text-xs mb-2">{sendError}</p>}
        <button
          onClick={onSendAll}
          disabled={isSending}
          className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
        >
          {isSending ? "Sending..." : "Send All"}
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
    <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-medium">
          {phaseLabel}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
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
      </div>

      <div className="p-3 border-t border-slate-700 shrink-0">
        <button
          onClick={onStageMessages}
          className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded font-medium transition-colors"
        >
          Confirm Messages
        </button>
      </div>
    </div>
  );
}
