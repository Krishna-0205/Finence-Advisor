import { useState } from "react";
import {
  X,
  ShieldCheck,
  Calculator,
  Layers,
  Calendar,
  ExternalLink,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { DataLineage, DataLineageSource } from "../../domain/finance/data-lineage";
import { money } from "../../domain/money";

export interface MetricDrillDownModalProps {
  calculation: DataLineage;
  onClose: () => void;
}

export function MetricDrillDownModal({
  calculation,
  onClose,
}: MetricDrillDownModalProps) {
  const [selectedRecord, setSelectedRecord] = useState<DataLineageSource | null>(null);

  const totalMinor =
    typeof calculation.result === "object" &&
    calculation.result !== null &&
    "minor" in calculation.result
      ? Number(calculation.result.minor)
      : calculation.sourceRecords.reduce(
          (sum, r) => sum + (Number(r.amountMinor) || 0),
          0,
        );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl border border-[#dce3df] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-[#26372f]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e5eae7] bg-[#f9faf9]">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-[#176b55] border border-emerald-200">
              <Calculator size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#153d31] m-0">
                  {calculation.metric.replace(/_/g, " ")}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-semibold">
                  {calculation.calculationVersion}
                </span>
              </div>
              <span className="text-xs text-[#738079]">
                Verifiable calculation & source record lineage
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#738079] hover:bg-[#eef3f0] hover:text-[#26372f]"
            aria-label="Close calculation drill-down"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Highlight KPI Block */}
          <div className="p-3.5 rounded-lg bg-[#f0f5f2] border border-[#d2ded7] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#55635c] uppercase tracking-wide">
                Calculated Value
              </span>
              <div className="text-2xl font-bold text-[#153d31] mt-0.5">
                {money(totalMinor)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#738079]">Source Sample</span>
              <div className="text-sm font-semibold text-[#34493d]">
                {calculation.sourceRecords.length} records
              </div>
            </div>
          </div>

          {/* Formula & Audit Metadata */}
          <div className="p-3.5 rounded-lg bg-[#f9faf9] border border-[#e5eae7] space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <Layers size={14} className="text-[#176b55] mt-0.5 shrink-0" />
              <div>
                <strong className="text-[#153d31]">Formula:</strong>{" "}
                <span className="font-mono text-[#34493d]">
                  {calculation.formula || "Sum of verified ledger components"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e5eae7] text-[11px] text-[#55635c]">
              <div>
                <span className="font-medium text-[#738079]">Data as of:</span>{" "}
                {String(calculation.dataAsOf)}
              </div>
              <div>
                <span className="font-medium text-[#738079]">Calculation ID:</span>{" "}
                <span className="font-mono">{calculation.calculationId}</span>
              </div>
            </div>
          </div>

          {/* Selected Record Detail Popup */}
          {selectedRecord && (
            <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs animate-in fade-in">
              <div className="flex items-center justify-between font-semibold text-amber-950 mb-1.5">
                <span>Record Detail: {selectedRecord.referenceNumber || selectedRecord.recordId}</span>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="text-amber-800 hover:underline text-[11px]"
                >
                  Close detail
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[#34493d] mb-2">
                <div>
                  <span className="text-[#738079]">Counterparty:</span> {selectedRecord.counterparty || "—"}
                </div>
                <div>
                  <span className="text-[#738079]">Amount:</span>{" "}
                  <strong>{money(Number(selectedRecord.amountMinor) || 0)}</strong>
                </div>
                <div>
                  <span className="text-[#738079]">Status:</span> {selectedRecord.status || "—"}
                </div>
                <div>
                  <span className="text-[#738079]">Date:</span> {selectedRecord.date || "—"}
                </div>
              </div>
              {selectedRecord.href && (
                <a
                  href={selectedRecord.href}
                  className="inline-flex items-center gap-1 font-semibold text-[#176b55] hover:underline"
                >
                  Open original document <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {/* Source Records Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#153d31] m-0">
                Source Records ({calculation.sourceRecords.length})
              </h4>
              <span className="text-[11px] text-[#738079]">
                Click a record to inspect original document
              </span>
            </div>

            <div className="border border-[#e5eae7] rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#f6f8f7] text-[#55635c] border-b border-[#e5eae7] sticky top-0">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Reference</th>
                    <th className="py-2 px-3 font-semibold">Counterparty</th>
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold text-right">Amount</th>
                    <th className="py-2 px-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5eae7]">
                  {calculation.sourceRecords.map((r, i) => (
                    <tr
                      key={r.recordId + i}
                      onClick={() => setSelectedRecord(r)}
                      className="hover:bg-[#f9faf9] cursor-pointer"
                    >
                      <td className="py-2 px-3 font-mono text-[#26372f]">
                        <div className="font-semibold">
                          {r.referenceNumber || r.recordId}
                        </div>
                        <div className="text-[10px] text-[#738079]">{r.recordType}</div>
                      </td>
                      <td className="py-2 px-3 text-[#34493d]">
                        {r.counterparty || "—"}
                      </td>
                      <td className="py-2 px-3 text-[#738079]">
                        {r.date || "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-[#153d31]">
                        {money(Number(r.amountMinor) || 0)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.href ? (
                          <a
                            href={r.href}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] text-[#176b55] hover:underline font-medium"
                          >
                            Open <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-[#a0aca5] text-[10px]">Verifiable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#e5eae7] bg-[#f9faf9] flex items-center justify-between text-xs text-[#738079]">
          <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            Every number is traced to an immutable ledger event
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-white border border-[#dce3df] text-[#34493d] hover:bg-[#f2f6f3]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
