import type { Money } from "./money";

export const CASH_FLOW_DRIVER_TYPES = [
  "SUPPLIER_PAYMENTS",
  "RECEIVABLE_DELAYS",
  "OPERATING_EXPENSES",
  "INVESTING",
  "FINANCING",
  "OTHER",
] as const;

export const CASH_FLOW_DRIVER_VERSION = "cash-flow-drivers-v1";

export type CashFlowDriverType =
  (typeof CASH_FLOW_DRIVER_TYPES)[number];

export interface CashFlowDriver {
  type: CashFlowDriverType;
  label: string;

  impact: Money;

  contributionPercent: number;

  sourceRecordCount: number;

  sourceRecordIds: string[];

  explanation: string;
}

export interface ReceivableDelayEvent {
  receivableId: string;
  originalExpectedDate: Date | string;
  revisedExpectedDate: Date | string;
  amount: Money;
  reason?: string;
}

export interface CashFlowDriverAnalysis {
  periodStart: Date | string;
  periodEnd: Date | string;

  totalCashChange: Money;

  drivers: CashFlowDriver[];

  primaryDriver: CashFlowDriverType | null;

  calculationVersion: string;

  generatedAt: Date | string;
}
