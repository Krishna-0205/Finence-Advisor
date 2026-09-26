import React from "react";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { DataFreshness } from "../../domain/finance/freshness";

interface FreshnessBadgeProps {
  freshness?: DataFreshness | null;
  compact?: boolean;
  showTransaction?: boolean;
  className?: string;
}

export function FreshnessBadge({
  freshness,
  compact = false,
  showTransaction = true,
  className = "",
}: FreshnessBadgeProps) {
  if (!freshness) return null;

  const isFresh = freshness.status === "FRESH";
  const isAging = freshness.status === "AGING";
  const isStale = freshness.status === "STALE";

  const statusColor = isFresh
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : isAging
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-rose-700 bg-rose-50 border-rose-200";

  const dotColor = isFresh
    ? "bg-emerald-500"
    : isAging
      ? "bg-amber-500"
      : "bg-rose-500";

  const timeFormatted = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return iso;
    }
  };

  const ageText = (() => {
    const s = freshness.ageSeconds;
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d > 1 ? "s" : ""} ago`;
  })();

  if (compact) {
    return (
      <span
        title={`Generated: ${timeFormatted(freshness.generatedAt)} · Data as of: ${timeFormatted(freshness.dataAsOf)}${freshness.lastTransactionAt ? ` · Last tx: ${timeFormatted(freshness.lastTransactionAt)}` : ""}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap flex-shrink-0 ${statusColor} ${className}`}
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span style={{ whiteSpace: "nowrap" }}>{isFresh ? `Updated ${ageText}` : isAging ? `Aging (${ageText})` : `Stale (${ageText})`}</span>
      </span>
    );
  }

  return (
    <div className={`freshness-indicator inline-flex flex-col gap-0.5 text-[11px] rounded-lg p-2 border ${statusColor} ${className}`}>
      <div className="flex items-center gap-1.5 font-medium">
        {isFresh ? (
          <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
        ) : (
          <AlertTriangle size={13} className={isAging ? "text-amber-600 flex-shrink-0" : "text-rose-600 flex-shrink-0"} />
        )}
        <span>
          {isFresh ? `✓ Updated ${ageText}` : `⚠ Data may be stale · Updated ${ageText}`}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] opacity-85 mt-0.5 pl-4">
        <span>Data as of: {timeFormatted(freshness.dataAsOf)}</span>
        {showTransaction && freshness.lastTransactionAt && (
          <>
            <span>•</span>
            <span>Last tx: {timeFormatted(freshness.lastTransactionAt)}</span>
          </>
        )}
      </div>
    </div>
  );
}
