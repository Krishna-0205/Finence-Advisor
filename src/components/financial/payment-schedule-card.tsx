import { useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  ArrowUpRight,
  Calendar,
  Clock,
  Layers,
  X,
  ExternalLink,
} from "lucide-react";
import type { PaymentScheduleSummary, ScheduledPaymentItem } from "../../domain/finance/payment-scheduling";
import { money } from "../../domain/money";
import { Status, Modal } from "../ui";

interface Props {
  scheduleSummary: PaymentScheduleSummary;
}

export function PaymentScheduleCard({ scheduleSummary }: Props) {
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const buckets = [
    {
      key: "thisWeek",
      bucket: scheduleSummary.dueThisWeek,
      color: "border-amber-500/30 bg-amber-950/20 text-amber-300",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
    {
      key: "nextWeek",
      bucket: scheduleSummary.dueNextWeek,
      color: "border-sky-500/30 bg-sky-950/20 text-sky-300",
      badgeColor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    },
    {
      key: "scheduledLater",
      bucket: scheduleSummary.scheduledLater,
      color: "border-stone-500/30 bg-stone-900/30 text-stone-300",
      badgeColor: "bg-stone-500/20 text-stone-300 border-stone-500/30",
    },
  ];

  const activeDrillDown = buckets.find((b) => b.key === selectedBucket)?.bucket;

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-[#161616] text-stone-200 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Payment Scheduling & Planning
            </div>
            <h3 className="text-base font-bold text-white" style={{ color: "#ffffff", margin: "3px 0 0" }}>
              Approved Payment Schedule
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span>Total planned:</span>
          <strong className="text-stone-100 font-mono text-sm">
            {money(scheduleSummary.totalScheduledMinor)}
          </strong>
          <span className="text-[11px] text-stone-400 font-normal">
            ({scheduleSummary.totalScheduledCount} invoices)
          </span>
        </div>
      </div>

      <p className="text-xs text-stone-400 mb-4 leading-relaxed">
        Distinguishes authorized obligations from planned payment timing. Approved invoices
        do not impact cash until planned dates, feeding directly into the 30-day forecast.
      </p>

      {/* 3 Weekly Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {buckets.map(({ key, bucket, color, badgeColor }) => (
          <div
            key={key}
            onClick={() => setSelectedBucket(bucket.count > 0 ? key : null)}
            className={`p-4 rounded-xl border transition-all cursor-pointer hover:border-white/30 flex flex-col justify-between ${color}`}
          >
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[11px]">
                  {bucket.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${badgeColor}`}>
                  {bucket.count} invoice{bucket.count !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-stone-100 mb-1">
                {money(bucket.totalMinor)}
              </div>
              <div className="text-[11px] text-stone-400">
                {bucket.startDate === bucket.endDate
                  ? bucket.startDate
                  : `${bucket.startDate} to ${bucket.endDate}`}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-stone-400 font-medium">
              <span>{bucket.count > 0 ? "Inspect scheduled invoices" : "No payments scheduled"}</span>
              {bucket.count > 0 && <ChevronRight size={14} />}
            </div>
          </div>
        ))}
      </div>

      {/* Drill-down Modal */}
      {activeDrillDown && (
        <Modal
          title={`Payments ${activeDrillDown.label.toLowerCase()} (${money(activeDrillDown.totalMinor)})`}
          onClose={() => setSelectedBucket(null)}
        >
          <div className="p-2 space-y-3">
            <div className="text-xs text-stone-400 flex items-center justify-between pb-2 border-b border-white/10">
              <span>{activeDrillDown.items.length} obligations scheduled</span>
              <span>Calculation ID: {activeDrillDown.items[0]?.calculationId || "system"}</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {activeDrillDown.items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-white/5 bg-black/30 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/invoices/${item.id}`}
                        className="font-bold text-stone-200 hover:text-emerald-400 flex items-center gap-1"
                      >
                        {item.invoiceNumber}
                        <ArrowUpRight size={13} />
                      </a>
                      <span className="text-stone-400 font-medium">
                        · {item.vendorName}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-3">
                      <span>Scheduled: <strong className="text-stone-300">{item.scheduledDate}</strong></span>
                      <span>Due: {item.dueDate}</span>
                      {item.notes && <span className="italic truncate max-w-[180px]">"{item.notes}"</span>}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-stone-100">
                      {money(item.amountMinor)}
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
