import { useState } from "react";
import {
  Compass,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Link as LinkIcon,
  Layers,
  Clock,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import type {
  CashFlowDriver,
  CashFlowDriverType,
} from "../../domain/finance/cash-flow-drivers";
import type { CashFlowDriverWithLineage } from "../../server/finance/cash-flow-driver-engine";
import type { LineageSourceRecord } from "../../domain/finance/lineage";
import { money } from "../../domain/money";

export interface CashFlowDriversCardProps {
  analysis: CashFlowDriverWithLineage;
  className?: string;
  onFilterType?: (type: CashFlowDriverType | null) => void;
}

export function CashFlowDriversCard({
  analysis,
  className = "",
  onFilterType,
}: CashFlowDriversCardProps) {
  const [selectedDriver, setSelectedDriver] = useState<CashFlowDriverType | null>(null);
  const [showLineageAudit, setShowLineageAudit] = useState(false);

  const totalChangeMinor = analysis.totalCashChange.minor;
  const isNetOutflow = totalChangeMinor < 0;

  function handleSelectDriver(type: CashFlowDriverType) {
    const next = selectedDriver === type ? null : type;
    setSelectedDriver(next);
    onFilterType?.(next);
  }

  const filteredRecords: LineageSourceRecord[] = selectedDriver
    ? analysis.records.filter((r) => r.driverType === selectedDriver)
    : analysis.records;

  return (
    <div className={`forecast-card ${className} border border-[#dce3df] rounded-xl bg-white p-5 shadow-sm`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eae7] pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#176b55]">
            <Compass size={14} />
            <span>EXPLAINABILITY & DATA LINEAGE</span>
            <span>·</span>
            <span>WHAT CHANGED & WHY</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#153d31] mt-1">
            Cash-Flow Drivers & Lineage
          </h2>
          <p className="text-xs text-[#738079] mt-0.5">
            Deterministic ranking of cash movements. Never estimated by AI.
          </p>
        </div>

        {/* Primary Driver Pill & Audit Toggle */}
        <div className="flex items-center gap-2">
          {analysis.primaryDriver && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Primary Driver: {getDriverShortLabel(analysis.primaryDriver)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowLineageAudit(!showLineageAudit)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[#f6f8f7] border border-[#dce3df] text-[#34493d] hover:bg-[#eef3f0]"
          >
            <ShieldCheck size={13} className="text-[#176b55]" />
            Lineage Audit
            {showLineageAudit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-3.5 rounded-lg bg-[#f9faf9] border border-[#e5eae7]">
          <span className="text-xs font-medium text-[#738079]">Net Cash Change</span>
          <div className="text-lg font-bold text-[#153d31] mt-1 flex items-center gap-1.5">
            {isNetOutflow ? (
              <ArrowDownRight size={18} className="text-rose-600" />
            ) : (
              <ArrowUpRight size={18} className="text-emerald-600" />
            )}
            {money(totalChangeMinor)}
          </div>
          <span className="text-[11px] text-[#738079]">
            Over {analysis.records.length} classified ledger transactions
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#f9faf9] border border-[#e5eae7]">
          <span className="text-xs font-medium text-[#738079]">Top Contributing Driver</span>
          <div className="text-lg font-bold text-[#153d31] mt-1">
            {analysis.drivers[0]?.label || "None recorded"}
          </div>
          <span className="text-[11px] text-[#738079]">
            {analysis.drivers[0]?.contributionPercent || 0}% of net movement
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#f9faf9] border border-[#e5eae7]">
          <span className="text-xs font-medium text-[#738079]">Audit Verification</span>
          <div className="text-lg font-bold text-emerald-800 mt-1 flex items-center gap-1.5">
            <ShieldCheck size={18} className="text-emerald-600" />
            100% Traceable
          </div>
          <span className="text-[11px] text-[#738079]">
            Engine: {analysis.calculationVersion}
          </span>
        </div>
      </div>

      {/* Lineage Audit Trail Drawer */}
      {showLineageAudit && (
        <div className="mb-5 p-4 rounded-lg bg-emerald-50/40 border border-emerald-200 text-xs text-[#26372f]">
          <div className="flex items-center justify-between font-semibold text-emerald-950 mb-2">
            <span className="flex items-center gap-1.5">
              <Layers size={14} className="text-emerald-700" />
              Mathematical Proof & Audit Lineage
            </span>
            <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              {analysis.calculationVersion}
            </span>
          </div>
          <p className="mb-2 text-[#34493d]">
            <strong>Lineage Formula:</strong> {analysis.lineage.formula}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2.5 rounded border border-emerald-200/70 mb-3">
            <div>
              <span className="text-[#738079]">data_timestamp:</span> {analysis.lineage.dataTimestamp}
            </div>
            <div>
              <span className="text-[#738079]">generated_at:</span> {analysis.lineage.generatedAt}
            </div>
            <div>
              <span className="text-[#738079]">source_record_count:</span> {analysis.lineage.sourceRecordCount}
            </div>
            <div>
              <span className="text-[#738079]">primary_driver:</span> {analysis.primaryDriver || "none"}
            </div>
          </div>
          <div className="text-[11px] text-[#55635c]">
            <strong>Source Record IDs:</strong>{" "}
            <span className="font-mono">{analysis.lineage.sourceRecordIds.join(", ") || "None"}</span>
          </div>
        </div>
      )}

      {/* Drivers List & Contribution Breakdown */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs font-semibold text-[#153d31] mb-2">
          <span>Ranked Drivers (What Changed & Why)</span>
          <span className="text-[#738079]">Click a driver to drill down to source records</span>
        </div>

        <div className="space-y-2">
          {analysis.drivers.map((d: CashFlowDriver) => {
            const isSelected = selectedDriver === d.type;
            const isDriverOutflow = d.impact.minor < 0;

            return (
              <div
                key={d.type}
                onClick={() => handleSelectDriver(d.type)}
                className={`cursor-pointer transition-all border rounded-lg p-3 ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50/50 shadow-xs"
                    : "border-[#e5eae7] hover:border-[#176b55] hover:bg-[#f9faf9]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#153d31]">
                      {d.label}
                    </span>
                    <span className="text-xs text-[#738079]">
                      ({d.sourceRecordCount} records)
                    </span>
                    {analysis.primaryDriver === d.type && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                        Primary
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-[#153d31]">
                      {money(d.impact.minor)}
                    </span>
                    <span className="text-xs text-[#738079] ml-2">
                      ({d.contributionPercent}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar of relative contribution */}
                <div className="w-full bg-[#e5eae7] h-1.5 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.type === "RECEIVABLE_DELAYS"
                        ? "bg-amber-500"
                        : isDriverOutflow
                          ? "bg-emerald-700"
                          : "bg-teal-600"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, d.contributionPercent))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#55635c]">
                  <span>{d.explanation}</span>
                  <span className="text-emerald-700 font-medium">
                    {isSelected ? "Showing drill-down ↑" : "Inspect transactions →"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drill-Down Section (Where did the number come from?) */}
      <div className="border-t border-[#e5eae7] pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#153d31] m-0">
              Drill-Down: Source Records ({filteredRecords.length})
            </h3>
            <span className="text-xs text-[#738079]">
              {selectedDriver
                ? `Filtered by ${getDriverShortLabel(selectedDriver)}`
                : "All contributing ledger transactions"}
            </span>
          </div>

          {selectedDriver && (
            <button
              type="button"
              onClick={() => handleSelectDriver(selectedDriver)}
              className="text-xs text-[#176b55] hover:underline font-semibold"
            >
              Clear filter (Show all)
            </button>
          )}
        </div>

        {filteredRecords.length === 0 ? (
          <p className="text-xs text-[#738079] py-3 text-center">
            No source records in this classification.
          </p>
        ) : (
          <div className="overflow-x-auto border border-[#e5eae7] rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#f6f8f7] text-[#55635c] border-b border-[#e5eae7]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Record ID / Ref</th>
                  <th className="py-2.5 px-3 font-semibold">Counterparty</th>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Driver Category</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eae7]">
                {filteredRecords.slice(0, 15).map((r) => (
                  <tr key={r.id} className="hover:bg-[#f9faf9]">
                    <td className="py-2.5 px-3 font-mono text-[#26372f]">
                      <div className="font-semibold">{r.reference}</div>
                      <div className="text-[10px] text-[#738079]">{r.id}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[#26372f]">
                      {r.counterparty || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-[#55635c]">
                      {r.date}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f4f1] text-[#34493d]">
                        {r.driverType ? getDriverShortLabel(r.driverType) : r.sourceType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#153d31]">
                      {r.direction === "OUTFLOW" ? "−" : "+"}
                      {money(r.amount.minor)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {r.href && (
                        <a
                          href={r.href}
                          className="inline-flex items-center gap-1 text-[11px] text-[#176b55] hover:underline font-medium"
                        >
                          View <ExternalLink size={11} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getDriverShortLabel(type: CashFlowDriverType): string {
  switch (type) {
    case "SUPPLIER_PAYMENTS":
      return "Supplier Payments";
    case "RECEIVABLE_DELAYS":
      return "Receivable Delays";
    case "OPERATING_EXPENSES":
      return "Operating Expenses";
    case "INVESTING":
      return "Investing (Capex)";
    case "FINANCING":
      return "Financing Activities";
    case "OTHER":
      return "Other";
    default:
      return "Classified Movement";
  }
}
