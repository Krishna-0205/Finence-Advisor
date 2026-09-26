/**
 * Background Jobs Model
 * Feature 37: Asynchronous Job Processing
 */

export type JobType =
  | "DOCUMENT_EXTRACTION"
  | "CSV_IMPORT"
  | "REPORT_GENERATION"
  | "ANOMALY_RECALCULATION"
  | "DAILY_SNAPSHOT"
  | "NOTIFICATION";

export type JobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface BackgroundJob<TInput = any, TResult = any> {
  id: string;
  companyId: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0 to 100
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  inputPayload?: TInput;
  result?: TResult;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string; // ISO
  startedAt?: string;
  completedAt?: string;
}

export interface EnqueueJobRequest<TInput = any> {
  companyId: string;
  type: JobType;
  idempotencyKey: string;
  inputPayload?: TInput;
  maxAttempts?: number;
}
