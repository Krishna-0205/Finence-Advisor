import { useState } from "react";
import {
  PieChart,
  Layers,
  Building,
  Tag,
  ShieldAlert,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import type {
  SpendConcentrationReport,
  DimensionConcentration,
  ConcentrationBucket,
} from "../../domain/finance/spend-concentration";
import { money } from "../../domain/money";
import { Modal } from "../ui";

interface Props {
  report: SpendConcentrationReport;
}

export function SpendConcentrationCard({ report }: Props) {
  const [activeTab, setActiveTab] = useState<"VENDOR" | "CATEGORY" | "DEPARTMENT">("VENDOR");
  const [selectedBucket, setSelectedBucket] = useState<ConcentrationBucket | null>(null);

  const dimensionData: DimensionConcentration =
    activeTab === "VENDOR"
      ? report.vendorConcentration
      : activeTab === "CATEGORY"
        ? report.categoryConcentration
        : report.departmentConcentration;

  const riskBadgeStyles = {
    LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    MODERATE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    HIGH: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      {/* Header with Dimension Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <PieChart size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
              Procurement &amp; Spend Analytics
            </div>
            <h3 className="text-base font-bold text-white" style={{ color: "#ffffff", margin: "3px 0 0" }}>
              Spend Concentration Analysis
            </h3>
          </div>
        </div>

        {/* Dimension Switcher */}
        <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("VENDOR")}
            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer border-0 ${
              activeTab === "VENDOR"
                ? "bg-cyan-600 text-white shadow"
                : "bg-transparent text-stone-300 hover:text-white hover:bg-white/10"
            }`}
          >
            Vendor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CATEGORY")}
            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer border-0 ${
              activeTab === "CATEGORY"
                ? "bg-cyan-600 text-white shadow"
                : "bg-transparent text-stone-300 hover:text-white hover:bg-white/10"
            }`}
          >
            Category
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("DEPARTMENT")}
            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer border-0 ${
              activeTab === "DEPARTMENT"
                ? "bg-cyan-600 text-white shadow"
                : "bg-transparent text-stone-300 hover:text-white hover:bg-white/10"
            }`}
          >
            Department
          </button>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-0.5">
            Top 1 Share (CR1)
          </div>
          <div className="text-lg font-mono font-bold text-cyan-400">
            {dimensionData.cr1}%
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            {dimensionData.buckets[0]?.name || "N/A"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-0.5">
            Top 3 Share (CR3)
          </div>
          <div className="text-lg font-mono font-bold text-stone-200">
            {dimensionData.cr3}%
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            3 primary suppliers
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-0.5">
            Top 5 Share (CR5)
          </div>
          <div className="text-lg font-mono font-bold text-stone-200">
            {dimensionData.cr5}%
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            Cumulative share
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="text-[10px] uppercase font-semibold text-stone-400 mb-0.5">
            HHI Index &amp; Risk
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-bold text-stone-100">
              {dimensionData.hhi}
            </span>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                riskBadgeStyles[dimensionData.riskLevel]
              }`}
            >
              {dimensionData.riskLevel}
            </span>
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            Herfindahl score
          </div>
        </div>
      </div>

      {/* Concentration Breakdown Rows */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-stone-300 mb-2">
          {dimensionData.dimensionLabel} Distribution
        </div>

        {dimensionData.buckets.map((bucket, idx) => (
          <div
            key={bucket.id}
            onClick={() => setSelectedBucket(bucket)}
            className="p-3 rounded-xl border border-white/5 bg-black/25 hover:border-white/20 transition-all cursor-pointer flex flex-col gap-2"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-stone-500 text-[11px] w-4">
                  #{idx + 1}
                </span>
                <span className="font-bold text-stone-200">{bucket.name}</span>
                <span className="text-[11px] text-stone-400">
                  ({bucket.invoiceCount} invoice{bucket.invoiceCount !== 1 ? "s" : ""})
                </span>
              </div>

              <div className="flex items-center gap-3 font-mono">
                <span className="font-bold text-stone-100">
                  {money(bucket.spendMinor)}
                </span>
                <span className="text-cyan-400 font-bold w-12 text-right">
                  {bucket.percentage}%
                </span>
                <ChevronRight size={14} className="text-stone-500" />
              </div>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(3, bucket.percentage))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Underlying Invoices Drill-down Modal */}
      {selectedBucket && (
        <Modal
          title={`Spend Breakdown: ${selectedBucket.name} (${money(selectedBucket.spendMinor)})`}
          onClose={() => setSelectedBucket(null)}
        >
          <div className="p-2 space-y-3 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-white/10 text-stone-400">
              <span>{selectedBucket.invoices.length} contributing invoices</span>
              <span>Share: {selectedBucket.percentage}%</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {selectedBucket.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-lg border border-white/5 bg-black/25 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-stone-200">
                      {inv.invoiceNumber} · {inv.vendorName}
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-3 mt-0.5">
                      <span>Category: {inv.categoryName}</span>
                      <span>Dated: {inv.date}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="font-bold text-stone-100">
                      {money(inv.amountMinor)}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {inv.status}
                    </div>
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
