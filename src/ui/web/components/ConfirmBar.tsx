"use client";

import type { ValidationError } from "@/types";

interface Props {
  validationError: ValidationError | null;
  onConfirm: () => void;
  isLoading: boolean;
}

export default function ConfirmBar({
  validationError,
  onConfirm,
  isLoading,
}: Props) {
  const isValid = !validationError;

  return (
    <div className="space-y-3">
      <div className="text-sm">
        {isValid ? (
          <span className="text-emerald-400">✓ Draft is valid</span>
        ) : (
          <span className="text-red-400">⚠ {validationError?.key}</span>
        )}
      </div>
      <button
        onClick={onConfirm}
        disabled={!isValid || isLoading}
        className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
      >
        {isLoading ? "Confirming…" : "Confirm Roles"}
      </button>
    </div>
  );
}
