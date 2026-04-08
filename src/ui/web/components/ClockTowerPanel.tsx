"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

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
      {/* Instructions */}
      <div className="text-sm text-slate-300 space-y-2">
        <p className="font-medium text-slate-200">
          Load this into clocktower.live:
        </p>
        <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
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

      {/* JSON block — takes remaining space */}
      <div className="relative flex-1 min-h-0">
        <pre className="h-full bg-slate-900 border border-slate-700 rounded-lg p-4 pr-12 text-sm text-slate-300 overflow-auto whitespace-pre-wrap break-all select-all font-mono">
          {compactJson}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 bg-slate-700 hover:bg-slate-600 text-slate-200 p-2 rounded-md transition-colors"
          title={copied ? "Copied!" : "Copy JSON"}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      {/* Error + Start Night */}
      <div className="shrink-0 space-y-3">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={onStartNight}
          disabled={isStartNightLoading}
          className="w-full bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:cursor-not-allowed text-base"
        >
          {isStartNightLoading ? "Sending Roles…" : "Start the First Night"}
        </button>
      </div>
    </div>
  );
}
