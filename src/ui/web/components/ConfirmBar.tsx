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
      {isValid ? (
        <div className="parchment text-sm px-3 py-2 rounded-md flex items-center gap-2 text-[#2a1f12]">
          <span aria-hidden="true">✓</span>
          <span className="font-display tracking-wide">Draft is sealed</span>
        </div>
      ) : (
        <div className="wax-seal text-sm px-3 py-2 rounded-md flex items-center gap-2">
          <span aria-hidden="true">⚠</span>
          <span>{validationError?.key}</span>
        </div>
      )}
      <button
        onClick={onConfirm}
        disabled={!isValid || isLoading}
        className="w-full font-display tracking-[0.1em] uppercase text-sm px-4 py-2.5 rounded-lg transition-all disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg"
        style={{
          background: isValid
            ? "linear-gradient(180deg, var(--color-ember) 0%, color-mix(in srgb, var(--color-ember) 70%, black) 100%)"
            : "var(--color-ink-2)",
          color: isValid ? "#1a1410" : "var(--color-parchment-2)",
          border: `1px solid ${isValid ? "var(--color-gold)" : "color-mix(in srgb, var(--color-gold) 30%, transparent)"}`,
          opacity: isValid && !isLoading ? 1 : 0.6,
        }}
      >
        {isLoading ? "Sealing…" : "Confirm Roles"}
      </button>
    </div>
  );
}
