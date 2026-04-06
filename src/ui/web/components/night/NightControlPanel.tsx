"use client";

import type { NightDetail } from "@/types";
import {
  AwaitingDeathNarrativePanel,
  AwaitingPlayersPanel,
  StagingPanel,
  StatusPanel,
  TemplatePanel,
} from "./NightControlPanelViews";
import { useNightControlPanelState } from "./useNightControlPanelState";

type PanelStage = "template" | "staging";

interface NightControlPanelProps {
  detail: NightDetail;
  channelId: string;
  panelStage: PanelStage;
  onPanelStageChange: (stage: PanelStage) => void;
  stagedMessages: Record<string, string>;
  onStagedMessagesChange: (msgs: Record<string, string>) => void;
}

export default function NightControlPanel({
  detail,
  channelId,
  panelStage,
  onPanelStageChange,
  stagedMessages,
  onStagedMessagesChange,
}: NightControlPanelProps) {
  const {
    localInfoMessages,
    localDraftFields,
    localDeathConfirmMessages,
    localDeathDraftFields,
    isSending,
    sendError,
    handleFieldChange,
    handleDeathDraftFieldChange,
    handleStageMessages,
    handleSendAll,
  } = useNightControlPanelState({
    detail,
    channelId,
    panelStage,
    onPanelStageChange,
    stagedMessages,
    onStagedMessagesChange,
  });

  const { nightStatus } = detail;
  const allPlayers = detail.allPlayers ?? [];
  const scriptRoles = detail.scriptRoles ?? [];

  if (!nightStatus || nightStatus === "completed") {
    return (
      <StatusPanel
        text={
          nightStatus === "completed" ? "Night complete." : "No active session."
        }
      />
    );
  }

  if (nightStatus === "awaiting_players") {
    const pendingCount = detail.players.filter(
      (player) => player.pending,
    ).length;
    return <AwaitingPlayersPanel pendingCount={pendingCount} />;
  }

  if (nightStatus === "awaiting_death_narrative") {
    const pendingDead = detail.players.filter(
      (player) => !player.alive && player.pending,
    );
    return <AwaitingDeathNarrativePanel pendingDead={pendingDead} />;
  }

  const isDeathConfirmPhase =
    nightStatus === "awaiting_storyteller_death_confirm";
  const isActionPhase = nightStatus === "awaiting_storyteller_action";
  const phaseLabel = isDeathConfirmPhase
    ? "Death Narratives"
    : isActionPhase
      ? "Action Messages"
      : "Info Messages";
  const entries = isActionPhase
    ? detail.actionMessages
    : isDeathConfirmPhase
      ? undefined
      : detail.infoMessages;

  if (!isDeathConfirmPhase && (!entries || entries.length === 0)) {
    return <StatusPanel text="Loading messages..." />;
  }

  if (isDeathConfirmPhase && (detail.deathConfirmEntries ?? []).length === 0) {
    return <StatusPanel text="Loading messages..." />;
  }

  if (panelStage === "staging") {
    return (
      <StagingPanel
        stagedMessages={stagedMessages}
        allPlayers={allPlayers}
        sendError={sendError}
        isSending={isSending}
        onBack={() => onPanelStageChange("template")}
        onSendAll={handleSendAll}
      />
    );
  }

  return (
    <TemplatePanel
      detail={detail}
      phaseLabel={phaseLabel}
      isDeathConfirmPhase={isDeathConfirmPhase}
      isActionPhase={isActionPhase}
      localInfoMessages={localInfoMessages}
      localDraftFields={localDraftFields}
      localDeathConfirmMessages={localDeathConfirmMessages}
      localDeathDraftFields={localDeathDraftFields}
      allPlayers={allPlayers}
      scriptRoles={scriptRoles}
      onFieldChange={handleFieldChange}
      onDeathDraftFieldChange={handleDeathDraftFieldChange}
      onStageMessages={handleStageMessages}
    />
  );
}
