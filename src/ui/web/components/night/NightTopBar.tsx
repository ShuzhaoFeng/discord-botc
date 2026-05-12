import type { NightDetail } from "@/types";
import { ArrowLeft } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

interface NightTopBarProps {
  detail: NightDetail;
  onBack: () => void;
}

export default function NightTopBar({ detail, onBack }: NightTopBarProps) {
  const pendingCount = detail.players.filter((p) => p.pending).length;
  const aliveCount = detail.players.filter((p) => p.alive).length;

  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-gold/30 bg-ink-2/40">
      <Tooltip content="Back to games">
        <button
          onClick={onBack}
          aria-label="Back to games"
          className="text-parchment-2/60 hover:text-ember text-sm transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
      </Tooltip>
      <span className="font-display tracking-wide text-parchment">
        {detail.gameId}
      </span>
      <span className="inline-flex items-center gap-1.5 text-parchment-2/70 text-sm font-display tracking-wide">
        <span aria-hidden="true">🌙</span> Night {detail.nightNumber}
      </span>
      {detail.nightStatus && (
        <span className="text-xs text-parchment-2/70 bg-ink-2 border border-gold/30 px-2 py-0.5 rounded font-display tracking-wide">
          {detail.nightStatus.replace(/_/g, " ")}
        </span>
      )}
      <span className="ml-auto inline-flex items-center gap-3 text-xs text-parchment-2/60">
        <span className="inline-flex items-center gap-1">
          <span className="candle-flicker leading-none" aria-hidden="true">
            🕯️
          </span>
          {pendingCount} pending
        </span>
        <span className="text-parchment-2/30">·</span>
        <span>{aliveCount} alive</span>
      </span>
    </div>
  );
}
