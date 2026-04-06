import type { NightDetail } from "@/types";

interface NightTopBarProps {
  detail: NightDetail;
  onBack: () => void;
}

export default function NightTopBar({ detail, onBack }: NightTopBarProps) {
  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-slate-700 bg-slate-850">
      <button
        onClick={onBack}
        className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
      >
        {"<-"}
      </button>
      <span className="font-semibold text-slate-200">{detail.gameId}</span>
      <span className="text-slate-500 text-sm">Night {detail.nightNumber}</span>
      {detail.nightStatus && (
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
          {detail.nightStatus.replace(/_/g, " ")}
        </span>
      )}
      <span className="ml-auto text-xs text-slate-600">
        {detail.players.filter((player) => player.pending).length} pending |{" "}
        {detail.players.filter((player) => player.alive).length} alive
      </span>
    </div>
  );
}
