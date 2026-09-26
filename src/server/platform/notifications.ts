import { randomUUID } from "node:crypto";
import type { Ledger } from "../../domain/types";
import type { Notification, NotificationSummary, NotificationType } from "../../domain/platform/notifications";
import { money } from "../../domain/money";

const notificationStore = new Map<string, Notification>();

/**
 * Creates and logs a notification.
 */
export function sendNotification(
  companyId: string,
  params: Omit<Notification, "id" | "companyId" | "createdAt">,
): Notification {
  const id = `notif_${randomUUID()}`;
  const now = new Date().toISOString();

  const notification: Notification = {
    ...params,
    id,
    companyId,
    createdAt: now,
  };

  notificationStore.set(id, notification);
  return notification;
}

/**
 * Marks a notification as read.
 */
export function markNotificationAsRead(companyId: string, notificationId: string): boolean {
  const notif = notificationStore.get(notificationId);
  if (!notif || notif.companyId !== companyId) return false;

  notif.readAt = new Date().toISOString();
  return true;
}

/**
 * Marks all notifications for a company / user as read.
 */
export function markAllNotificationsAsRead(companyId: string, userId?: string): number {
  let count = 0;
  for (const notif of notificationStore.values()) {
    if (notif.companyId === companyId && (!userId || notif.userId === userId) && !notif.readAt) {
      notif.readAt = new Date().toISOString();
      count++;
    }
  }
  return count;
}

/**
 * Retrieves notifications and unread count.
 */
export function getNotifications(
  companyId: string,
  userId?: string,
  limit: number = 30,
): NotificationSummary {
  const list = Array.from(notificationStore.values())
    .filter((n) => n.companyId === companyId && (!userId || !n.userId || n.userId === userId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const unreadCount = list.filter((n) => !n.readAt).length;

  return {
    unreadCount,
    totalCount: list.length,
    notifications: list.slice(0, limit),
  };
}

/**
 * Synchronizes notifications from a ledger state.
 * Inspects overdue invoices, budget alerts, and receivables.
 */
export function syncLedgerNotifications(ledger: Ledger): void {
  const companyId = ledger.company.id;
  const now = new Date().toISOString().split("T")[0];

  // 1. Overdue Invoices
  for (const inv of ledger.invoices) {
    if (inv.due_date < now && !["PAID", "REJECTED"].includes(inv.status)) {
      const key = `overdue_${inv.id}`;
      if (!Array.from(notificationStore.values()).some((n) => n.entityId === inv.id && n.type === "INVOICE_OVERDUE")) {
        const vendor = ledger.vendors.find((v) => v.id === inv.vendor_id)?.name || "Vendor";
        sendNotification(companyId, {
          type: "INVOICE_OVERDUE",
          severity: "CRITICAL",
          title: "🔴 Invoice Overdue",
          message: `${vendor} · ${inv.invoice_number} · ${money(inv.total_minor)} is past due date (${inv.due_date}).`,
          entityType: "invoice",
          entityId: inv.id,
          linkUrl: `/invoices/${inv.id}`,
        });
      }
    }
  }

  // 2. Overdue Receivables
  for (const rec of ledger.receivables) {
    const uncollected = rec.amount_minor - rec.received_minor;
    if (rec.due_date < now && uncollected > 0) {
      if (!Array.from(notificationStore.values()).some((n) => n.entityId === rec.id && n.type === "RECEIVABLE_OVERDUE")) {
        sendNotification(companyId, {
          type: "RECEIVABLE_OVERDUE",
          severity: "WARNING",
          title: "🟠 Overdue Customer Receivable",
          message: `${rec.customer_name} · ${rec.reference_number} · ${money(uncollected)} outstanding since ${rec.due_date}.`,
          entityType: "receivable",
          entityId: rec.id,
          linkUrl: `/ledger`,
        });
      }
    }
  }

  // 3. Duplicate Risks from Alerts
  for (const alert of ledger.alerts) {
    if (alert.alert_type === "DUPLICATE_INVOICE" && alert.status === "OPEN") {
      if (!Array.from(notificationStore.values()).some((n) => n.entityId === alert.invoice_id && n.type === "DUPLICATE_RISK")) {
        sendNotification(companyId, {
          type: "DUPLICATE_RISK",
          severity: "CRITICAL",
          title: "🔴 Duplicate Payment Risk",
          message: `Invoice ${alert.title}: Potential duplicate detected against existing vendor invoices.`,
          entityType: "invoice",
          entityId: alert.invoice_id,
          linkUrl: `/invoices/${alert.invoice_id}`,
        });
      }
    }
  }
}
