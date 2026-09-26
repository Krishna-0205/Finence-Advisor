import type { Money } from "./money";

export interface DataLineage {
  calculationId: string;
  metric: string;
  calculationVersion: string;
  generatedAt: string;
  dataAsOf: string;
  sourceRecords: DataLineageSource[];
  formula?: string;
  result?: Money | number;
}

export interface DataLineageSource {
  recordId: string;
  recordType:
    | "INVOICE"
    | "PAYMENT"
    | "RECEIVABLE"
    | "RECEIPT"
    | "BUDGET"
    | "CASH_FLOW"
    | "DOCUMENT";
  amountMinor?: number;
  sourceDocumentId?: string;
  referenceNumber?: string;
  counterparty?: string;
  date?: string;
  status?: string;
  description?: string;
  href?: string;
}

import type { DataFreshness } from "./freshness";

export interface LineageBackedKPI {
  metric: string;
  label: string;
  value: Money;
  lineage: {
    calculationId: string;
    metric: string;
    calculationVersion: string;
    generatedAt: string;
    dataAsOf: string;
    sourceRecordCount: number;
    formula?: string;
  };
  freshness?: DataFreshness;
}

export interface AIAnswerEvidence {
  calculationId: string;
  metric: string;
  calculationVersion: string;
  generatedAt: Date | string;
  dataAsOf: Date | string;
  lastTransactionAt?: Date | string;
  freshnessStatus?: "FRESH" | "AGING" | "STALE";
  sourceRecordIds: string[];
  sourceDocumentIds: string[];
}

export interface AdvisorAnswer {
  answer: string;
  evidence: AIAnswerEvidence[];
  generatedAt: Date | string;
  freshness?: DataFreshness;
}
