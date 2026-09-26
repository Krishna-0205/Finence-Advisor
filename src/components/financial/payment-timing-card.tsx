import { useState } from "react";
import {
  CalendarClock,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import type { MultiTimingComparison, TimingScenarioType, PaymentTimingImpact } from "../../server/finance/payment-timing-simulation";
import { money } from "../../domain/money";
import { Status } from "../ui";

interface Props {
  comparison: MultiTimingComparison;
  onSchedule?: (date: string) => Promise<void>;
  busy?: boolean;
}

export function PaymentTimingCard({ comparison, onSchedule, busy }: Props) {
  const [selectedScenario, setSelectedScenario] = useState<TimingScenarioType>("DELAY_15");
  const [scheduling, setScheduling] = useState(false);

  const scenarioTabs: Array<{ key: TimingScenarioType; label: string }> = [
    { key: "PAY_NOW", label: "Pay today" },
    { key: "DELAY_7", label: "+7 days" },
    { key: "DELAY_15", label: "+15 days" },
    { key: "DELAY_30", label: "+30 days" },
  ];

  const payNow = comparison.scenarios.PAY_NOW;
  const currentSelected = comparison.scenarios[selectedScenario];

  async function handleSchedule() {
    if (!onSchedule) return;
    setScheduling(true);
    try {
      await onSchedule(currentSelected.paymentDate);
    } finally {
      setScheduling(false);
    }
  }

  const riskBadgeColors = {
    LOW: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    MEDIUM: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    HIGH: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    CRITICAL: "bg-red-600/20 text-red-300 border-red-600/30",
  };

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">
              Payment Timing Simulator
            </div>
            <h3 className="text-base font-bold text-white" style={{ color: "#ffffff", margin: "3px 0 0" }}>
              Pay Now vs Delay vs Schedule
            </h3>
          </div>
        </div>

        <div className="text-xs text-stone-400 font-mono">
          Due: {comparison.dueDate} · Balance:{" "}
          <strong className="text-stone-200">{money(comparison.outstandingMinor)}</strong>
        </div>
      </div>

      <p className="text-xs text-stone-400 mb-4 leading-relaxed">
        Simulates the trade-off between preserving immediate cash and incurring vendor late fees,
        loss of prompt-payment discounts, and risk signal escalations.
      </p>

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {scenarioTabs.map((tab) => {
          const isSelected = selectedScenario === tab.key;
          const s = comparison.scenarios[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedScenario(tab.key)}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                isSelected
                  ? "border-violet-500 bg-violet-950/40 text-violet-200 font-bold shadow-md ring-1 ring-violet-400/50"
                  : "border-white/10 bg-black/30 text-stone-300 hover:text-white hover:border-white/30 hover:bg-white/10"
              }`}
            >
              <div className="text-xs font-semibold">{tab.label}</div>
              <div className="text-[10px] text-stone-300 mt-0.5">{s.paymentDate}</div>
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Comparison: Today vs Selected Scenario */}
      <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-3 mb-4 text-xs">
        <div className="grid grid-cols-3 pb-2 border-b border-white/10 font-semibold text-stone-400 text-[11px] uppercase tracking-wider">
          <div>Metric</div>
          <div className="text-right">Pay Today</div>
          <div className="text-right text-violet-300">{currentSelected.label}</div>
        </div>

        {/* Cash today */}
        <div className="grid grid-cols-3 items-center">
          <span className="text-stone-300">Cash Today</span>
          <span className="font-mono text-right text-stone-400">
            {money(payNow.cashAfterPaymentMinor)}
          </span>
          <span className="font-mono text-right font-bold text-stone-100">
            {money(currentSelected.cashAfterPaymentMinor)}
          </span>
        </div>

        {/* 30d projected cash */}
        <div className="grid grid-cols-3 items-center">
          <span className="text-stone-300">30d Projected Cash</span>
          <span className="font-mono text-right text-stone-400">
            {money(payNow.projectedCashAt30DaysMinor)}
          </span>
          <span className="font-mono text-right font-bold text-stone-100">
            {money(currentSelected.projectedCashAt30DaysMinor)}
          </span>
        </div>

        {/* Budget utilization */}
        <div className="grid grid-cols-3 items-center">
          <span className="text-stone-300">Budget Utilization</span>
          <span className="font-mono text-right text-stone-400">
            {payNow.budgetUtilizationPercent.toFixed(0)}%
          </span>
          <span className="font-mono text-right font-bold text-stone-100">
            {currentSelected.budgetUtilizationPercent.toFixed(0)}%
          </span>
        </div>

        {/* Late Fee & Lost Discounts */}
        <div className="grid grid-cols-3 items-center">
          <span className="text-stone-300">Late Fee &amp; Penalties</span>
          <span className="font-mono text-right text-stone-400">₹0</span>
          <span className="font-mono text-right font-bold text-amber-400">
            {currentSelected.cost.totalCostMinor > 0
              ? money(currentSelected.cost.totalCostMinor)
              : "₹0"}
          </span>
        </div>

        {/* Deterministic Risk Level */}
        <div className="grid grid-cols-3 items-center pt-1 border-t border-white/5">
          <span className="text-stone-300">Deterministic Risk</span>
          <div className="text-right">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                riskBadgeColors[payNow.riskAfter]
              }`}
            >
              {payNow.riskAfter}
            </span>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                riskBadgeColors[currentSelected.riskAfter]
              }`}
            >
              {currentSelected.riskAfter}
            </span>
          </div>
        </div>
      </div>

      {/* Assumptions & Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-[11px] text-stone-400 space-y-0.5">
          <div className="font-semibold text-stone-300">Assumptions:</div>
          <div>• No unexpected emergency expenses</div>
          <div>• Scheduled collections arrive per forecast</div>
        </div>

        {onSchedule && selectedScenario !== "PAY_NOW" && (
          <button
            type="button"
            onClick={handleSchedule}
            disabled={busy || scheduling}
            className="primary text-xs flex items-center gap-1.5"
          >
            <span>Schedule for {currentSelected.paymentDate}</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
