"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

interface Props {
  clocktowerJson: object;
  onStartNight: () => void;
  isStartNightLoading: boolean;
  error: string | null;
}

export default function ClockTowerPanel({
  clocktowerJson,
  onStartNight,
  isStartNightLoading,
  error,
}: Props) {
  const [copied, setCopied] = useState(false);
  const compactJson = JSON.stringify(clocktowerJson);

  async function handleCopy() {
    await navigator.clipboard.writeText(compactJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      <div className="text-sm space-y-2">
        <p className="font-display tracking-wide text-parchment">
          📜 Load this into clocktower.live:
        </p>
        <ol className="list-decimal list-inside space-y-0.5 text-parchment-2/70">
          <li>Copy the JSON below</li>
          <li>
            Open the Game State modal in clocktower.live (storyteller menu)
          </li>
          <li>Paste and click &quot;Load State&quot;</li>
          <li>
            Use &quot;Distribute assigned characters&quot; to send roles to
            players
          </li>
        </ol>
      </div>

      <div className="relative flex-1 min-h-0">
        <pre className="h-full bg-ink-2 border border-gold/40 rounded-lg p-4 pr-12 text-sm text-parchment-2/80 overflow-auto whitespace-pre-wrap break-all select-all font-mono">
          {compactJson}
        </pre>
        <Tooltip content={copied ? "Copied!" : "Copy JSON"}>
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy JSON"}
            className="absolute top-3 right-3 bg-ink-2 border border-gold/40 hover:border-ember text-parchment p-2 rounded-md transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </Tooltip>
      </div>

      <div className="shrink-0 space-y-3">
        {error && (
          <p className="wax-seal text-sm px-3 py-2 rounded-md inline-flex items-center gap-2">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
        <button
          onClick={() => onStartNight()}
          disabled={isStartNightLoading}
          className="w-full font-display tracking-[0.1em] uppercase text-base px-6 py-3 rounded-lg transition-all disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg"
          style={{
            background:
              "linear-gradient(180deg, var(--color-ember) 0%, color-mix(in srgb, var(--color-ember) 70%, black) 100%)",
            color: "#1a1410",
            border: "1px solid var(--color-gold)",
            opacity: isStartNightLoading ? 0.6 : 1,
          }}
        >
          {isStartNightLoading ? "Sending Roles…" : "🌙 Start the First Night"}
        </button>
      </div>
    </div>
  );
}
