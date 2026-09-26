import { randomUUID } from "node:crypto";
import type { BackgroundJob, EnqueueJobRequest, JobType } from "../../domain/platform/jobs";
import { logSecurityEvent } from "../security/events";

// In-memory job repository for demo/cloud hybrid
const jobStore = new Map<string, BackgroundJob>();
const idempotencyIndex = new Map<string, string>(); // idempotencyKey -> jobId

type JobHandler = (
  job: BackgroundJob,
  updateProgress: (pct: number) => void,
) => Promise<any>;

const registeredHandlers = new Map<JobType, JobHandler>();

/**
 * Registers an asynchronous worker handler for a specific job type.
 */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  registeredHandlers.set(type, handler);
}

/**
 * Enqueues a job with idempotency protection.
 * If a job with the same idempotency key already exists, returns the existing job.
 */
export function enqueueJob<TInput = any, TResult = any>(
  req: EnqueueJobRequest<TInput>,
): BackgroundJob<TInput, TResult> {
  const existingJobId = idempotencyIndex.get(`${req.companyId}:${req.idempotencyKey}`);
  if (existingJobId && jobStore.has(existingJobId)) {
    return jobStore.get(existingJobId) as BackgroundJob<TInput, TResult>;
  }

  const id = `job_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: BackgroundJob<TInput, TResult> = {
    id,
    companyId: req.companyId,
    type: req.type,
    status: "QUEUED",
    progress: 0,
    attempts: 0,
    maxAttempts: req.maxAttempts || 3,
    idempotencyKey: req.idempotencyKey,
    inputPayload: req.inputPayload,
    createdAt: now,
  };

  jobStore.set(id, job);
  idempotencyIndex.set(`${req.companyId}:${req.idempotencyKey}`, id);

  // Trigger worker asynchronously
  setTimeout(() => {
    processJob(id).catch((err) => {
      console.error(`[JobWorker] Error processing job ${id}:`, err);
    });
  }, 10);

  return job;
}

/**
 * Internal async job processor with retry logic.
 */
async function processJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job || job.status === "CANCELLED" || job.status === "COMPLETED") return;

  job.status = "PROCESSING";
  job.startedAt = new Date().toISOString();
  job.attempts++;

  const handler = registeredHandlers.get(job.type);
  if (!handler) {
    job.status = "FAILED";
    job.errorCode = "NO_HANDLER";
    job.errorMessage = `No worker registered for job type ${job.type}`;
    job.completedAt = new Date().toISOString();
    return;
  }

  const updateProgress = (pct: number) => {
    job.progress = Math.max(0, Math.min(100, Math.round(pct)));
  };

  try {
    const result = await handler(job, updateProgress);
    job.status = "COMPLETED";
    job.progress = 100;
    job.result = result;
    job.completedAt = new Date().toISOString();
  } catch (error: any) {
    if (job.attempts < job.maxAttempts) {
      job.status = "QUEUED";
      job.errorMessage = `Attempt ${job.attempts} failed: ${error?.message || "Unknown error"}. Retrying...`;
      setTimeout(() => processJob(jobId), 1000 * job.attempts);
    } else {
      job.status = "FAILED";
      job.errorCode = "EXECUTION_ERROR";
      job.errorMessage = error?.message || "Job execution failed after maximum retries.";
      job.completedAt = new Date().toISOString();

      logSecurityEvent(job.companyId, {
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "WARNING",
        title: `Background Job Failed: ${job.type}`,
        description: `Job ${job.id} exhausted ${job.maxAttempts} attempts: ${job.errorMessage}`,
      });
    }
  }
}

/**
 * Gets a background job by ID.
 */
export function getJob<TResult = any>(
  companyId: string,
  jobId: string,
): BackgroundJob<any, TResult> | undefined {
  const job = jobStore.get(jobId);
  if (!job || job.companyId !== companyId) return undefined;
  return job;
}

/**
 * Lists background jobs for a company.
 */
export function listJobs(
  companyId: string,
  limit: number = 20,
): BackgroundJob[] {
  return Array.from(jobStore.values())
    .filter((j) => j.companyId === companyId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

// ----------------------------------------------------------------------------
// Built-in Default Job Workers
// ----------------------------------------------------------------------------

registerJobHandler("DOCUMENT_EXTRACTION", async (job, updateProgress) => {
  updateProgress(20);
  await new Promise((r) => setTimeout(r, 100));
  updateProgress(60);
  await new Promise((r) => setTimeout(r, 100));
  updateProgress(100);
  return {
    documentId: job.inputPayload?.fileId || "doc-1",
    extractedFields: {
      invoiceNumber: "INV-AUTO-EXTRACTED",
      totalMinor: 4500000,
      currency: "INR",
    },
  };
});

registerJobHandler("REPORT_GENERATION", async (job, updateProgress) => {
  updateProgress(25);
  await new Promise((r) => setTimeout(r, 80));
  updateProgress(75);
  await new Promise((r) => setTimeout(r, 80));
  updateProgress(100);
  return {
    reportType: job.inputPayload?.reportType || "FINANCIAL_REPORT",
    generatedAt: new Date().toISOString(),
    recordCount: job.inputPayload?.recordCount || 42,
  };
});

registerJobHandler("ANOMALY_RECALCULATION", async (job, updateProgress) => {
  updateProgress(50);
  await new Promise((r) => setTimeout(r, 50));
  updateProgress(100);
  return { anomaliesRecalculated: true, timestamp: new Date().toISOString() };
});
