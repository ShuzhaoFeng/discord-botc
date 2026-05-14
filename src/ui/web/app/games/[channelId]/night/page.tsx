"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { NightDetail } from "@/types";
import NightChatArea from "@/components/night/NightChatArea";
import NightControlPanel from "@/components/night/NightControlPanel";
import NightPlayerSidebar from "@/components/night/NightPlayerSidebar";
import NightTopBar from "@/components/night/NightTopBar";
import GameEndApprovalBanner from "@/components/night/GameEndApprovalBanner";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "@/components/ui/ResizablePanels";

export default function NightPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<NightDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared by control panel and chat editor.
  const [panelStage, setPanelStage] = useState<"template" | "staging">(
    "template",
  );
  const [stagedMessages, setStagedMessages] = useState<Record<string, string>>(
    {},
  );

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
      <div className="h-full flex items-center justify-center text-parchment-2/60 italic">
        Loading…
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-parchment-2/70">
        <p className="mb-4 italic">
          {error ?? "Game not found or not in night phase."}
        </p>
        <button
          onClick={() => router.push("/games")}
          className="text-sm text-parchment-2/80 hover:text-ember underline underline-offset-2 transition-colors"
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

  const stagedMessage =
    panelStage === "staging" && selectedId
      ? stagedMessages[selectedId]
      : undefined;

  return (
    <div className="h-full flex flex-col">
      <NightTopBar detail={detail} onBack={() => router.push("/games")} />
      {detail.pendingGameEnds.length > 0 && (
        <GameEndApprovalBanner
          channelId={channelId}
          queue={detail.pendingGameEnds}
        />
      )}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize="22%" minSize="14%" maxSize="40%" id="players">
          <NightPlayerSidebar
            players={detail.players}
            conversations={detail.conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Panel>
        <PanelResizeHandle direction="horizontal" />
        <Panel defaultSize="52%" minSize="28%" id="chat">
          <NightChatArea
            player={selectedPlayer}
            messages={selectedMessages}
            stagedMessage={stagedMessage}
            onStagedChange={
              selectedId
                ? (msg) =>
                    setStagedMessages((prev) => ({
                      ...prev,
                      [selectedId]: msg,
                    }))
                : undefined
            }
          />
        </Panel>
        <PanelResizeHandle direction="horizontal" />
        <Panel defaultSize="26%" minSize="16%" maxSize="45%" id="control">
          <NightControlPanel
            detail={detail}
            channelId={channelId}
            panelStage={panelStage}
            onPanelStageChange={setPanelStage}
            stagedMessages={stagedMessages}
            onStagedMessagesChange={setStagedMessages}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
