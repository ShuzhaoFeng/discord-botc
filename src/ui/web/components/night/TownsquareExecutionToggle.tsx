"use client";

import { useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Switch } from "@/components/ui/Switch";

interface TownsquareExecutionToggleProps {
  channelId: string;
  value: boolean;
  enabled: boolean;
}

/** Sticky: the flag stays set until the storyteller flips it off. */
export default function TownsquareExecutionToggle({
  channelId,
  value,
  enabled,
}: TownsquareExecutionToggleProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setValue(next: boolean) {
    if (!enabled || busy || next === value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/night/${channelId}/set-townsquare-execution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: next }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const label = value ? "death by execution" : "death not by execution";

  return (
    <Tooltip
      content={
        enabled
          ? "Whether the next death synced from clocktower.live is treated as an execution (Saint can trigger)."
          : "Only available while a day is open."
      }
    >
      <label
        className={`inline-flex items-center gap-2 text-xs font-display tracking-wide select-none ${
          enabled ? "text-parchment-2/80" : "text-parchment-2/30"
        }`}
        title={error ?? undefined}
      >
        <Switch
          checked={value}
          onCheckedChange={setValue}
          disabled={!enabled || busy}
          aria-label="Townsquare death execution toggle"
        />
        <span>{label}</span>
      </label>
    </Tooltip>
  );
}
