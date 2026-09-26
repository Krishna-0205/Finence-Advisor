/**
 * Notifications Domain Model
 * Feature 38: In-App and Email Notifications
 */

export type NotificationType =
  | "INVOICE_OVERDUE"
  | "BUDGET_WARNING"
  | "DUPLICATE_RISK"
  | "LOW_CASH"
  | "RECEIVABLE_OVERDUE"
  | "APPROVAL_REQUIRED";

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Notification {
  id: string;
  companyId: string;
  userId?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType?: "invoice" | "payment" | "receivable" | "budget" | "company";
  entityId?: string;
  linkUrl?: string;
  readAt?: string; // ISO when read
  createdAt: string; // ISO
}

export interface NotificationSummary {
  unreadCount: number;
  totalCount: number;
  notifications: Notification[];
}
