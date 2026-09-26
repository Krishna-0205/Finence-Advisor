import { useState } from "react";
import {
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CreditCard,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import type { CustomerPaymentBehavior } from "../../domain/finance/customer-behavior";
import { money } from "../../domain/money";
import { Modal } from "../ui";

interface Props {
  behaviors: Record<string, CustomerPaymentBehavior>;
}

export function CustomerPaymentBehaviorCard({ behaviors }: Props) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const customerList = Object.values(behaviors).sort(
    (a, b) => b.outstandingMinor - a.outstandingMinor,
  );

  const selectedBehavior = selectedCustomerId ? behaviors[selectedCustomerId] : null;

  if (customerList.length === 0) return null;

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
              Customer Intelligence
            </div>
            <h3 className="text-base font-bold text-stone-100">
              Customer Payment Behavior Profiles
            </h3>
          </div>
        </div>

        <div className="text-xs text-stone-400">
          Derived from actual receivable &amp; payment receipt history
        </div>
      </div>

      {/* Grid of Customer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {customerList.map((c) => {
          const hasDelay = c.averageDelayDays > 0;
          const delayColor = hasDelay
            ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
            : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

          return (
            <div
              key={c.customerId}
              className="p-4 rounded-xl border border-white/5 bg-black/25 hover:border-white/20 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-bold text-sm text-stone-100">{c.customerName}</h4>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {c.invoiceCount} invoices · {c.paidInvoiceCount} paid
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${delayColor}`}
                  >
                    {hasDelay ? `+${c.averageDelayDays}d delay` : "On time"}
                  </span>
                </div>

                {/* Metrics Table */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Average payment time</span>
                    <span className="font-mono font-bold text-stone-200">
                      {c.averagePaymentDays} days
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Contracted terms</span>
                    <span className="font-mono text-stone-300">
                      {c.contractedPaymentDays} days
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">On-time payment rate</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {c.onTimePercentage}%
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Late payment rate</span>
                    <span className="font-mono font-semibold text-rose-400">
                      {c.latePercentage}%
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-stone-400">Outstanding</span>
                    <span className="font-mono font-bold text-stone-100">
                      {money(c.outstandingMinor)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-400">Largest receivable</span>
                    <span className="font-mono text-stone-300">
                      {money(c.largestReceivableMinor)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action / Drill-down Button */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-stone-400">
                  {hasDelay
                    ? `Forecast adjusts: +${c.averageDelayDays}d expected collection`
                    : "Forecast on schedule"}
                </span>
                {c.observedInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerId(c.customerId)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                  >
                    View history ({c.observedInvoices.length}) →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down modal for observed invoices */}
      {selectedBehavior && (
        <Modal
          title={`Payment History: ${selectedBehavior.customerName}`}
          onClose={() => setSelectedCustomerId(null)}
        >
          <div className="p-2 space-y-3 text-xs">
            <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-black/40 border border-white/10 text-[11px]">
              <div>
                <span className="text-stone-400">Contracted: </span>
                <span className="font-mono font-bold text-stone-200">
                  {selectedBehavior.contractedPaymentDays} days
                </span>
              </div>
              <div>
                <span className="text-stone-400">Historical Avg: </span>
                <span className="font-mono font-bold text-stone-200">
                  {selectedBehavior.averagePaymentDays} days
                </span>
              </div>
              <div>
                <span className="text-stone-400">Avg Delay: </span>
                <span
                  className={`font-mono font-bold ${
                    selectedBehavior.averageDelayDays > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {selectedBehavior.averageDelayDays > 0
                    ? `+${selectedBehavior.averageDelayDays} days`
                    : "0 days"}
                </span>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {selectedBehavior.observedInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-lg border border-white/5 bg-black/25 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-stone-200">{inv.referenceNumber}</div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-3">
                      <span>Issued: {inv.issueDate}</span>
                      <span>Due: {inv.dueDate}</span>
                      <span>Paid: {inv.paymentDate}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-stone-100">
                      {money(inv.amountMinor)}
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full inline-block mt-1 ${
                        inv.isLate
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {inv.isLate ? `+${inv.delayDays}d Late (${inv.paymentDays}d)` : `On time (${inv.paymentDays}d)`}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                className="secondary text-xs"
                onClick={() => setSelectedCustomerId(null)}
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
