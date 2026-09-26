import { useState } from "react";
import {
  Building2,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Clock,
  Calendar,
  Layers,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type {
  VendorConcentrationReport,
  VendorIntelligence,
} from "../../domain/finance/vendor-intelligence";
import { money } from "../../domain/money";
import { Modal, Status } from "../ui";

interface Props {
  report: VendorConcentrationReport;
}

export function VendorIntelligenceCard({ report }: Props) {
  const [selectedVendor, setSelectedVendor] = useState<VendorIntelligence | null>(null);
  const [viewingDuplicates, setViewingDuplicates] = useState(false);

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Building2 size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
              Supplier Intelligence &amp; Concentration
            </div>
            <h3 className="text-base font-bold text-stone-100">
              Vendor Analytics &amp; Price Trends
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-400">Total Supplier Spend:</span>
          <span className="font-mono font-bold text-stone-100">
            {money(report.totalSupplierSpendMinor)}
          </span>
          <span className="text-stone-500">|</span>
          <span className="text-stone-400">Policy Threshold:</span>
          <span className="font-mono text-purple-300">
            {report.policyThresholdPercentage}%
          </span>
        </div>
      </div>

      {/* High Concentration Warning Banner */}
      {report.highConcentrationVendors.length > 0 && (
        <div className="mb-4 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-rose-200">
              Supplier Concentration Threshold Exceeded (≥{report.policyThresholdPercentage}%)
            </div>
            <p className="text-stone-300 text-[11px] mt-0.5 leading-relaxed">
              {report.highConcentrationVendors.map((v) => (
                <span key={v.vendorId} className="inline-block mr-3">
                  <strong>{v.vendorName}:</strong> {v.spendConcentrationPercentage}% of total spend ({money(v.totalSpendMinor)})
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {report.vendors.map((v) => {
          const isHighConcentration =
            v.spendConcentrationPercentage >= report.policyThresholdPercentage;
          const hasDuplicates = v.duplicateSignalCount > 0;
          const trendColor =
            v.priceTrendPercentage > 0
              ? "text-rose-400"
              : v.priceTrendPercentage < 0
                ? "text-emerald-400"
                : "text-stone-400";

          return (
            <div
              key={v.vendorId}
              className={`p-4 rounded-xl border bg-black/25 flex flex-col justify-between transition-all hover:border-white/20 ${
                isHighConcentration ? "border-amber-500/30" : "border-white/5"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-bold text-sm text-stone-100 flex items-center gap-1.5">
                      {v.vendorName}
                      {isHighConcentration && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                          Concentrated
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] text-stone-400">
                      {v.category} · {v.invoiceFrequency} invoices
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-stone-100 text-sm">
                      {money(v.totalSpendMinor)}
                    </div>
                    <div className="text-[11px] font-mono text-stone-400">
                      {v.spendConcentrationPercentage}% of spend
                    </div>
                  </div>
                </div>

                {/* Price Trend Bar / Visualization */}
                {v.priceHistory.length > 1 && (
                  <div className="mb-3 p-2 rounded-lg bg-black/40 border border-white/5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-stone-400 flex items-center gap-1">
                        <TrendingUp size={12} className={trendColor} /> Price trend
                      </span>
                      <span className={`font-mono font-bold ${trendColor}`}>
                        {v.priceTrendPercentage > 0 ? `+${v.priceTrendPercentage}%` : `${v.priceTrendPercentage}%`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 pt-1">
                      {v.priceHistory.slice(-4).map((pt, idx, arr) => (
                        <span key={pt.id} className="flex items-center">
                          <span className="text-stone-300">{money(pt.amountMinor)}</span>
                          {idx < arr.length - 1 && (
                            <span className="mx-1 text-stone-600">─</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metrics */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Average invoice</span>
                    <span className="font-mono text-stone-200">
                      {money(v.averageInvoiceMinor)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Payment terms</span>
                    <span className="font-mono text-stone-300">
                      {v.paymentTermsDays} days
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">On-time payment</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {v.onTimePaymentPercentage}%
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-400">Duplicate signals</span>
                    <span
                      className={`font-mono font-bold ${
                        hasDuplicates ? "text-amber-400" : "text-stone-400"
                      }`}
                    >
                      {v.duplicateSignalCount} signal{v.duplicateSignalCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drill-down Actions */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                {hasDuplicates ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVendor(v);
                      setViewingDuplicates(true);
                    }}
                    className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer flex items-center gap-1"
                  >
                    <AlertTriangle size={12} /> View {v.duplicateSignalCount} duplicates →
                  </button>
                ) : (
                  <span className="text-stone-500">No risk signals</span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedVendor(v);
                    setViewingDuplicates(false);
                  }}
                  className="text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                >
                  View invoices ({v.underlyingInvoices.length}) →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drilldown Modal for Invoices / Duplicate Signals */}
      {selectedVendor && (
        <Modal
          title={
            viewingDuplicates
              ? `Duplicate Risk Signals: ${selectedVendor.vendorName}`
              : `Invoices: ${selectedVendor.vendorName} (${money(selectedVendor.totalSpendMinor)})`
          }
          onClose={() => {
            setSelectedVendor(null);
            setViewingDuplicates(false);
          }}
        >
          <div className="p-2 space-y-3 text-xs">
            {viewingDuplicates ? (
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 text-stone-300 text-xs">
                  Connected directly to anomaly risk engine. Review duplicate invoice numbers and amounts below.
                </div>
                {selectedVendor.duplicateSignals.map((sig, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-black/30 border border-amber-500/30 flex items-start justify-between"
                  >
                    <div>
                      <div className="font-bold text-amber-200">
                        {sig.title} · {sig.invoiceNumber}
                      </div>
                      <p className="text-[11px] text-stone-300 mt-1">{sig.reason}</p>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {sig.severity}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto space-y-2">
                {selectedVendor.underlyingInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 rounded-lg border border-white/5 bg-black/25 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-stone-200">
                        {inv.invoiceNumber} · {inv.description || "Invoice"}
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center gap-3">
                        <span>Dated: {inv.invoiceDate}</span>
                        <span>Due: {inv.dueDate}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-stone-100">
                        {money(inv.totalMinor)}
                      </div>
                      <span className="inline-block mt-1">
                        <Status value={inv.status} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 text-right">
              <button
                type="button"
                className="secondary text-xs"
                onClick={() => {
                  setSelectedVendor(null);
                  setViewingDuplicates(false);
                }}
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
