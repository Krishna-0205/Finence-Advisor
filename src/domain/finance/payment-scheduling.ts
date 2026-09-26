import type { Ledger, Invoice, PaymentSchedule } from "../types";
import { addDays, today } from "../money";
import { outstanding } from "../../server/finance";

export interface ScheduledPaymentItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  amountMinor: number;
  scheduledDate: string;
  dueDate: string;
  status: string;
  scheduleId?: string;
  notes?: string;
  calculationId: string;
  calculationVersion: string;
}

export interface PaymentScheduleBucket {
  label: string;
  startDate: string;
  endDate: string;
  totalMinor: number;
  count: number;
  items: ScheduledPaymentItem[];
}

export interface PaymentScheduleSummary {
  asOf: string;
  dueThisWeek: PaymentScheduleBucket;
  dueNextWeek: PaymentScheduleBucket;
  scheduledLater: PaymentScheduleBucket;
  totalScheduledMinor: number;
  totalScheduledCount: number;
  calculationId: string;
  calculationVersion: string;
  generatedAt: string;
}

export const PAYMENT_SCHEDULE_VERSION = "payment-schedule-v1";

/**
 * Calculates payment schedule planning buckets:
 * - Due this week (0 to 7 days from asOf)
 * - Due next week (8 to 14 days from asOf)
 * - Scheduled later (15+ days from asOf)
 */
export function calculatePaymentScheduleSummary(
  ledger: Ledger,
  asOf = today(),
): PaymentScheduleSummary {
  const day0 = asOf;
  const day7 = addDays(asOf, 7);
  const day8 = addDays(asOf, 8);
  const day14 = addDays(asOf, 14);

  const dueThisWeekItems: ScheduledPaymentItem[] = [];
  const dueNextWeekItems: ScheduledPaymentItem[] = [];
  const scheduledLaterItems: ScheduledPaymentItem[] = [];

  // Consider all approved, scheduled, or due active invoices with outstanding balance
  const activeInvoices = ledger.invoices.filter(
    (i) =>
      i.status !== "REJECTED" &&
      i.status !== "PAID" &&
      (i.status === "SCHEDULED" ||
        i.status === "APPROVED" ||
        i.status === "DUE" ||
        Boolean(i.approved_at)),
  );

  const schedulesByInvoice = new Map<string, PaymentSchedule>();
  if (ledger.payment_schedules) {
    for (const ps of ledger.payment_schedules) {
      if (ps.status === "SCHEDULED" || ps.status === "PROCESSING") {
        schedulesByInvoice.set(ps.invoice_id, ps);
      }
    }
  }

  for (const inv of activeInvoices) {
    const bal = outstanding(ledger, inv, asOf);
    if (bal <= 0) continue;

    const vendor = ledger.vendors.find((v) => v.id === inv.vendor_id);
    const vendorName = vendor?.name || "Vendor";

    const schedule = schedulesByInvoice.get(inv.id);
    const scheduledDate =
      schedule?.scheduled_date || inv.scheduled_payment_date || inv.due_date;

    const item: ScheduledPaymentItem = {
      id: inv.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      vendorId: inv.vendor_id,
      vendorName,
      amountMinor: bal,
      scheduledDate,
      dueDate: inv.due_date,
      status: schedule?.status || inv.status,
      scheduleId: schedule?.id,
      notes: schedule?.notes || inv.description,
      calculationId: `calc_sched_${inv.id}`,
      calculationVersion: PAYMENT_SCHEDULE_VERSION,
    };

    if (scheduledDate <= day7) {
      dueThisWeekItems.push(item);
    } else if (scheduledDate >= day8 && scheduledDate <= day14) {
      dueNextWeekItems.push(item);
    } else {
      scheduledLaterItems.push(item);
    }
  }

  const sumMinor = (items: ScheduledPaymentItem[]) =>
    items.reduce((sum, item) => sum + item.amountMinor, 0);

  const dueThisWeek: PaymentScheduleBucket = {
    label: "Due this week",
    startDate: day0,
    endDate: day7,
    totalMinor: sumMinor(dueThisWeekItems),
    count: dueThisWeekItems.length,
    items: dueThisWeekItems.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  };

  const dueNextWeek: PaymentScheduleBucket = {
    label: "Due next week",
    startDate: day8,
    endDate: day14,
    totalMinor: sumMinor(dueNextWeekItems),
    count: dueNextWeekItems.length,
    items: dueNextWeekItems.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  };

  const scheduledLater: PaymentScheduleBucket = {
    label: "Scheduled later",
    startDate: addDays(asOf, 15),
    endDate: "Future",
    totalMinor: sumMinor(scheduledLaterItems),
    count: scheduledLaterItems.length,
    items: scheduledLaterItems.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  };

  return {
    asOf,
    dueThisWeek,
    dueNextWeek,
    scheduledLater,
    totalScheduledMinor:
      dueThisWeek.totalMinor + dueNextWeek.totalMinor + scheduledLater.totalMinor,
    totalScheduledCount:
      dueThisWeek.count + dueNextWeek.count + scheduledLater.count,
    calculationId: `calc_sched_summary_${asOf.replace(/-/g, "")}`,
    calculationVersion: PAYMENT_SCHEDULE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
