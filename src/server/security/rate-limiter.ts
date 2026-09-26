import type { RateLimitPolicy } from "../../domain/finance/security";
import { logSecurityEvent } from "./events";

interface RateBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateBucket>();

/**
 * Checks and records a request against a rate limit policy.
 * Throws an Error if the limit is exceeded.
 */
export function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  context?: {
    companyId?: string;
    userId?: string;
    userName?: string;
  },
): { allowed: boolean; remaining: number; resetSeconds: number } {
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const storeKey = `${policy.identifierName}:${key}`;

  const bucket = rateLimitStore.get(storeKey) || { timestamps: [] };

  // Remove timestamps outside the sliding window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= policy.maxRequests) {
    const oldest = bucket.timestamps[0];
    const resetSeconds = Math.ceil((oldest + windowMs - now) / 1000);

    if (context?.companyId) {
      logSecurityEvent(context.companyId, {
        userId: context.userId,
        userName: context.userName,
        eventType: "RATE_LIMIT",
        severity: "WARNING",
        title: `Rate Limit Exceeded: ${policy.identifierName}`,
        description: `User exceeded limit of ${policy.maxRequests} requests per ${policy.windowSeconds}s. Try again in ${resetSeconds}s.`,
        resourceType: policy.identifierName,
      });
    }

    throw new Error(
      `Rate limit exceeded for ${policy.identifierName}. Limit is ${policy.maxRequests} requests per ${policy.windowSeconds > 60 ? `${Math.round(policy.windowSeconds / 60)} minutes` : `${policy.windowSeconds} seconds`}. Try again in ${resetSeconds}s.`,
    );
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(storeKey, bucket);

  const remaining = policy.maxRequests - bucket.timestamps.length;
  const resetSeconds = policy.windowSeconds;

  return { allowed: true, remaining, resetSeconds };
}

/**
 * Reset rate limit key (primarily for testing or administrative reset).
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
