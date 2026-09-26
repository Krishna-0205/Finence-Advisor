import type { Money } from "./money";
import type { CashFlowDriverType } from "./cash-flow-drivers";

export interface LineageSourceRecord {
  id: string;
  sourceType: "INVOICE" | "PAYMENT" | "RECEIVABLE" | "RECEIPT" | "BUDGET";
  reference: string;
  counterparty: string;
  date: string;
  amount: Money;
  direction: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  driverType?: CashFlowDriverType;
  status: string;
  href?: string;
  description?: string;
}

export interface LineageTrail {
  metricKey: string;
  metricLabel: string;
  value: Money;
  formula: string;
  calculationVersion: string;
  generatedAt: string;
  dataTimestamp: string;
  sourceRecordCount: number;
  sourceRecordIds: string[];
  records: LineageSourceRecord[];
}
