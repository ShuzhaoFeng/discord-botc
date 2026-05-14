"use client";

import { useEffect, useState } from "react";
import type { PendingGameEnd } from "@/types";

interface GameEndApprovalBannerProps {
  channelId: string;
  queue: PendingGameEnd[];
}

export default function GameEndApprovalBanner({
  channelId,
  queue,
}: GameEndApprovalBannerProps) {
  const head = queue[0];

  const [editing, setEditing] = useState(false);
  const [preamble, setPreamble] = useState("");
  const [winAnnouncement, setWinAnnouncement] = useState("");
  const [rolesReveal, setRolesReveal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reset edit state when the head of the queue changes.
  useEffect(() => {
    if (!head) {
      setEditing(false);
      setEditingId(null);
      return;
    }
    if (editingId !== head.id) {
      setPreamble(head.preamble ?? "");
      setWinAnnouncement(head.winAnnouncement);
      setRolesReveal(head.rolesReveal);
      setEditing(false);
      setEditingId(head.id);
      setError(null);
    }
  }, [head, editingId]);

  if (!head) return null;

  const teamLabel = head.team === "good" ? "Good Wins" : "Evil Wins";
  const teamClasses =
    head.team === "good"
      ? "border-fabled/50 bg-fabled/10 text-fabled"
      : "border-ember/60 bg-ember/10 text-ember";

  async function postApprove(useEdits: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = useEdits
        ? {
            preamble: preamble.trim() === "" ? null : preamble,
            winAnnouncement,
            rolesReveal,
          }
        : {};
      const res = await fetch(
        `/api/night/${channelId}/approve-game-end`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function postDismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/night/${channelId}/dismiss-game-end`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`shrink-0 border-b ${teamClasses.split(" ").slice(0, 2).join(" ")} px-4 py-3`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          className={`text-xs px-2 py-0.5 rounded font-display tracking-[0.18em] uppercase border ${teamClasses}`}
        >
          {teamLabel}
        </span>
        <span className="text-xs text-parchment-2/70 font-display tracking-wide">
          Win condition pending approval
        </span>
        {queue.length > 1 && (
          <span className="text-xs text-parchment-2/60 bg-ink-2 border border-gold/30 px-2 py-0.5 rounded">
            +{queue.length - 1} more queued
          </span>
        )}
        <span className="ml-auto text-xs text-parchment-2/40">
          Flow is not paused
        </span>
      </div>

      {!editing ? (
        <ProposalPreview head={head} />
      ) : (
        <ProposalEditor
          preamble={preamble}
          winAnnouncement={winAnnouncement}
          rolesReveal={rolesReveal}
          onPreambleChange={setPreamble}
          onWinAnnouncementChange={setWinAnnouncement}
          onRolesRevealChange={setRolesReveal}
        />
      )}

      {error && (
        <p className="text-xs text-ember mt-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        {!editing ? (
          <>
            <button
              disabled={busy}
              onClick={() => postApprove(false)}
              className="text-xs font-display tracking-wide px-3 py-1 border border-fabled/50 bg-fabled/15 text-fabled rounded hover:bg-fabled/25 transition-colors disabled:opacity-50"
            >
              Approve & end
            </button>
            <button
              disabled={busy}
              onClick={() => setEditing(true)}
              className="text-xs font-display tracking-wide px-3 py-1 border border-gold/40 text-parchment-2/80 rounded hover:text-ember hover:border-ember/50 transition-colors disabled:opacity-50"
            >
              Edit…
            </button>
            <button
              disabled={busy}
              onClick={postDismiss}
              className="text-xs font-display tracking-wide px-3 py-1 border border-gold/30 text-parchment-2/60 rounded hover:text-parchment hover:border-gold/50 transition-colors disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <button
              disabled={busy}
              onClick={() => postApprove(true)}
              className="text-xs font-display tracking-wide px-3 py-1 border border-fabled/50 bg-fabled/15 text-fabled rounded hover:bg-fabled/25 transition-colors disabled:opacity-50"
            >
              Send edited & end
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setPreamble(head.preamble ?? "");
                setWinAnnouncement(head.winAnnouncement);
                setRolesReveal(head.rolesReveal);
              }}
              className="text-xs font-display tracking-wide px-3 py-1 border border-gold/30 text-parchment-2/60 rounded hover:text-parchment hover:border-gold/50 transition-colors disabled:opacity-50"
            >
              Cancel edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProposalPreview({ head }: { head: PendingGameEnd }) {
  return (
    <div className="space-y-1.5 text-xs text-parchment-2/80 leading-relaxed">
      {head.preamble && (
        <p className="whitespace-pre-wrap italic text-parchment-2/60">
          {head.preamble}
        </p>
      )}
      <p className="whitespace-pre-wrap font-medium text-parchment">
        {head.winAnnouncement}
      </p>
      <pre className="whitespace-pre-wrap text-parchment-2/60 text-[11px] font-mono bg-ink-2/40 border border-gold/20 rounded px-2 py-1.5 mt-1 max-h-32 overflow-y-auto">
        {head.rolesReveal}
      </pre>
    </div>
  );
}

interface ProposalEditorProps {
  preamble: string;
  winAnnouncement: string;
  rolesReveal: string;
  onPreambleChange: (v: string) => void;
  onWinAnnouncementChange: (v: string) => void;
  onRolesRevealChange: (v: string) => void;
}

function ProposalEditor({
  preamble,
  winAnnouncement,
  rolesReveal,
  onPreambleChange,
  onWinAnnouncementChange,
  onRolesRevealChange,
}: ProposalEditorProps) {
  return (
    <div className="space-y-2">
      <EditorField
        label="Preamble (optional)"
        value={preamble}
        onChange={onPreambleChange}
        rows={2}
      />
      <EditorField
        label="Win announcement"
        value={winAnnouncement}
        onChange={onWinAnnouncementChange}
        rows={2}
      />
      <EditorField
        label="Role reveal"
        value={rolesReveal}
        onChange={onRolesRevealChange}
        rows={6}
        mono
      />
    </div>
  );
}

function EditorField({
  label,
  value,
  onChange,
  rows,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.18em] text-parchment-2/50 mb-1 font-display">
        {label}
      </label>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-ink-2/60 border border-gold/30 rounded px-2 py-1.5 text-xs text-parchment focus:outline-none focus:border-ember/60 ${mono ? "font-mono text-[11px]" : ""}`}
      />
    </div>
  );
}
