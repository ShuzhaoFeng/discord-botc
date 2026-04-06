"use client";

import { useEffect, useRef, useState } from "react";
import type { NightDetail } from "@/types";

type PanelStage = "template" | "staging";

interface UseNightControlPanelStateParams {
  detail: NightDetail;
  channelId: string;
  panelStage: PanelStage;
  onPanelStageChange: (stage: PanelStage) => void;
  stagedMessages: Record<string, string>;
  onStagedMessagesChange: (msgs: Record<string, string>) => void;
}

export function useNightControlPanelState({
  detail,
  channelId,
  panelStage,
  onPanelStageChange,
  stagedMessages,
  onStagedMessagesChange,
}: UseNightControlPanelStateParams) {
  const [localInfoMessages, setLocalInfoMessages] = useState<
    Record<string, string>
  >({});
  const [localDraftFields, setLocalDraftFields] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});
  const [localDeathConfirmMessages, setLocalDeathConfirmMessages] = useState<
    Record<string, string>
  >({});
  const [localDeathDraftFields, setLocalDeathDraftFields] = useState<
    Record<string, Record<string, string>>
  >({});
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (detail.nightStatus !== prevStatusRef.current) {
      onPanelStageChange("template");
      onStagedMessagesChange({});
      setSendError(null);
      setLocalDeathConfirmMessages({});
      setLocalDeathDraftFields({});
      prevStatusRef.current = detail.nightStatus;
    }
  }, [detail.nightStatus, onPanelStageChange, onStagedMessagesChange]);

  useEffect(() => {
    if (panelStage !== "template" || !detail.deathConfirmEntries) {
      return;
    }
    const msgMap: Record<string, string> = {};
    const fieldMap: Record<string, Record<string, string>> = {};
    for (const entry of detail.deathConfirmEntries) {
      msgMap[entry.userId] = entry.confirmation;
      if (entry.draft) {
        fieldMap[entry.userId] = { ...entry.draft.fields };
      }
    }
    setLocalDeathConfirmMessages(msgMap);
    setLocalDeathDraftFields(fieldMap);
  }, [detail.deathConfirmEntries, panelStage]);

  useEffect(() => {
    if (panelStage !== "template" || !detail.infoMessages) {
      return;
    }

    const msgMap: Record<string, string> = {};
    const fieldMap: Record<
      string,
      Record<string, string | number | boolean>
    > = {};

    for (const entry of detail.infoMessages) {
      msgMap[entry.userId] = entry.message;
      if (entry.draft) {
        fieldMap[entry.userId] = {
          ...(entry.draft.fields as Record<string, string | number | boolean>),
        };
      }
    }

    setLocalInfoMessages(msgMap);
    setLocalDraftFields(fieldMap);
  }, [detail.infoMessages, panelStage]);

  const handleFieldChange = async (
    userId: string,
    field: string,
    value: string | number | boolean,
  ) => {
    const prevVal = localDraftFields[userId]?.[field];
    setLocalDraftFields((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [field]: value },
    }));

    try {
      const res = await fetch(`/api/night/${channelId}/set-draft-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: userId, field, value }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message: string };
        setLocalInfoMessages((prev) => ({ ...prev, [userId]: data.message }));
      } else {
        setLocalDraftFields((prev) => ({
          ...prev,
          [userId]: { ...(prev[userId] ?? {}), [field]: prevVal },
        }));
      }
    } catch {
      setLocalDraftFields((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] ?? {}), [field]: prevVal },
      }));
    }
  };

  const handleDeathDraftFieldChange = async (
    userId: string,
    field: string,
    value: string,
  ) => {
    const prevVal = localDeathDraftFields[userId]?.[field];
    setLocalDeathDraftFields((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [field]: value },
    }));

    try {
      const res = await fetch(
        `/api/night/${channelId}/set-death-draft-field`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: userId, field, value }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { confirmation: string };
        setLocalDeathConfirmMessages((prev) => ({
          ...prev,
          [userId]: data.confirmation,
        }));
      } else {
        setLocalDeathDraftFields((prev) => ({
          ...prev,
          [userId]: { ...(prev[userId] ?? {}), [field]: prevVal },
        }));
      }
    } catch {
      setLocalDeathDraftFields((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] ?? {}), [field]: prevVal },
      }));
    }
  };

  const handleStageMessages = () => {
    const messages: Record<string, string> = {};

    if (
      detail.nightStatus === "awaiting_storyteller_action" &&
      detail.actionMessages
    ) {
      for (const entry of detail.actionMessages) {
        messages[entry.userId] = entry.message;
      }
    } else if (
      detail.nightStatus === "awaiting_storyteller_info" &&
      detail.infoMessages
    ) {
      for (const entry of detail.infoMessages) {
        messages[entry.userId] =
          localInfoMessages[entry.userId] ?? entry.message;
      }
    } else if (
      detail.nightStatus === "awaiting_storyteller_death_confirm" &&
      detail.deathConfirmEntries
    ) {
      for (const entry of detail.deathConfirmEntries) {
        messages[entry.userId] =
          localDeathConfirmMessages[entry.userId] ?? entry.confirmation;
      }
    }

    onStagedMessagesChange(messages);
    onPanelStageChange("staging");
  };

  const handleSendAll = async () => {
    setIsSending(true);
    setSendError(null);

    try {
      const { nightStatus } = detail;
      const endpoint =
        nightStatus === "awaiting_storyteller_action"
          ? `/api/night/${channelId}/send-action`
          : nightStatus === "awaiting_storyteller_death_confirm"
            ? `/api/night/${channelId}/send-death-confirm`
            : `/api/night/${channelId}/send-info`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: stagedMessages }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSendError(data.error ?? "Send failed");
      } else {
        onPanelStageChange("template");
        onStagedMessagesChange({});
      }
    } catch {
      setSendError("Network error");
    } finally {
      setIsSending(false);
    }
  };

  return {
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
  };
}
