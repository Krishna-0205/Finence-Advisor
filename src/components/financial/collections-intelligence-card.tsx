import { useState } from "react";
import {
  TrendingDown,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Building,
  Calendar,
} from "lucide-react";
import type { ReceivablesIntelligenceReport, AgingBucket } from "../../domain/finance/collections";
import { money } from "../../domain/money";
import { Status, Modal } from "../ui";

interface Props {
  report: ReceivablesIntelligenceReport;
}

export function CollectionsIntelligenceCard({ report }: Props) {
  const [selectedBucket, setSelectedBucket] = useState<AgingBucket | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);

  const agingOrder: AgingBucket[] = [
    "CURRENT",
    "DAYS_1_30",
    "DAYS_31_60",
    "DAYS_61_90",
    "DAYS_90_PLUS",
  ];

  const bucketColors: Record<AgingBucket, { bar: string; text: string; bg: string }> = {
    CURRENT: { bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
    DAYS_1_30: { bar: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/10" },
    DAYS_31_60: { bar: "bg-orange-500", text: "text-orange-400", bg: "bg-orange-500/10" },
    DAYS_61_90: { bar: "bg-rose-500", text: "text-rose-400", bg: "bg-rose-500/10" },
    DAYS_90_PLUS: { bar: "bg-red-600", text: "text-red-400", bg: "bg-red-600/10" },
  };

  const activeBucket = selectedBucket ? report.aging[selectedBucket] : null;

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <TrendingDown size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
              Receivables & Collections Intelligence
            </div>
            <h3 className="text-base font-bold text-white" style={{ color: "#ffffff", margin: "3px 0 0" }}>
              Customer Collections & Aging
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-400">Collection reliability:</span>
          <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {report.collectionReliabilityPercent}%
          </span>
        </div>
      </div>

      {/* Overdue > 60 Days Callout */}
      {report.overdue60DaysPlusMinor > 0 && (
        <div className="mb-4 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-rose-200">
              {report.overdue60DaysSummary}
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              Recommendation: <strong>{report.summaryRecommendation}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Top Priority Signal Callout */}
      {report.signals.length > 0 && report.overdue60DaysPlusMinor === 0 && (
        <div className="mb-4 p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-200">
              Collection Priority: {report.primaryPriorityCustomer}
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              {report.signals[0].recommendation}
            </p>
          </div>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-1">
            Total Outstanding
          </div>
          <div className="text-lg font-mono font-bold text-stone-100">
            {money(report.totalOutstandingMinor)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-1">
            Expected This Week
          </div>
          <div className="text-lg font-mono font-bold text-sky-400">
            {money(report.expectedThisWeekMinor)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-1">
            Total Overdue
          </div>
          <div className="text-lg font-mono font-bold text-amber-400">
            {money(report.totalOverdueMinor)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-1">
            Overdue &gt; 60 Days
          </div>
          <div className="text-lg font-mono font-bold text-rose-400">
            {money(report.overdue60DaysPlusMinor)}
          </div>
        </div>
      </div>

      {/* Aging Buckets Visualization */}
      <div className="space-y-2 mb-4">
        <div className="text-xs font-semibold text-stone-300 mb-2">
          Receivables Aging Analysis
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {agingOrder.map((bucketKey) => {
            const bucket = report.aging[bucketKey];
            const pct =
              report.totalOutstandingMinor > 0
                ? ((bucket.amountMinor / report.totalOutstandingMinor) * 100).toFixed(0)
                : "0";
            const colors = bucketColors[bucketKey];

            return (
              <div
                key={bucketKey}
                onClick={() => setSelectedBucket(bucket.count > 0 ? bucketKey : null)}
                className={`p-3 rounded-xl border border-white/5 bg-black/20 hover:border-white/20 transition-all cursor-pointer ${
                  selectedBucket === bucketKey ? "ring-1 ring-white/30" : ""
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className={`font-semibold ${colors.text}`}>{bucket.label}</span>
                  <span className="text-stone-400 font-mono text-[10px]">{pct}%</span>
                </div>
                <div className="font-mono font-bold text-sm text-stone-200">
                  {money(bucket.amountMinor)}
                </div>
                <div className="text-[10px] text-stone-400 mt-1">
                  {bucket.count} item{bucket.count !== 1 ? "s" : ""}
                </div>

                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${colors.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer Breakdown Accordion */}
      <div className="pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={() => setShowCustomers(!showCustomers)}
          className="text-xs text-sky-400 hover:text-sky-300 flex items-center justify-between w-full py-1 cursor-pointer font-medium"
        >
          <span>Expected Collections by Customer ({report.customers.length})</span>
          {showCustomers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showCustomers && (
          <div className="mt-3 space-y-2">
            {report.customers.map((c) => (
              <div
                key={c.customerName}
                className="p-3 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-stone-200 flex items-center gap-2">
                    <Building size={13} className="text-stone-400" />
                    {c.customerName}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {c.receivableCount} invoice{c.receivableCount !== 1 ? "s" : ""} ·{" "}
                    {c.overdueCount > 0 ? (
                      <span className="text-amber-400 font-medium">
                        {c.overdueCount} overdue ({c.oldestDaysOverdue}d delay)
                      </span>
                    ) : (
                      <span className="text-emerald-400">All current</span>
                    )}
                    {c.behavior && (
                      <span className="text-stone-500 ml-2">
                        · Avg pay: {c.behavior.averagePaymentDays}d (contract: {c.behavior.contractedPaymentDays}d) · {c.behavior.onTimePercentage}% on-time
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="font-bold text-stone-100">
                    {money(c.totalOutstandingMinor)}
                  </div>
                  {c.overdueMinor > 0 && (
                    <div className="text-[10px] text-amber-400 font-semibold">
                      {money(c.overdueMinor)} overdue
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aging Item Drilldown Modal */}
      {activeBucket && (
        <Modal
          title={`Receivables: ${activeBucket.label} (${money(activeBucket.amountMinor)})`}
          onClose={() => setSelectedBucket(null)}
        >
          <div className="p-2 space-y-3">
            <div className="text-xs text-stone-400 flex items-center justify-between pb-2 border-b border-white/10">
              <span>{activeBucket.items.length} receivables in this aging category</span>
              <span>Classification: {activeBucket.bucket}</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {activeBucket.items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-white/5 bg-black/30 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-stone-200">
                      {item.customerName} · {item.referenceNumber}
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-3">
                      <span>Due: {item.dueDate}</span>
                      {item.daysOverdue > 0 && (
                        <span className="text-amber-400 font-semibold">
                          {item.daysOverdue} days overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-stone-100">
                      {money(item.outstandingMinor)}
                    </div>
                    <span className="inline-block mt-1">
                      <Status value={item.status} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                className="secondary text-xs"
                onClick={() => setSelectedBucket(null)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
