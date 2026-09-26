/**
 * Performance Cache Layer
 * Feature 36: Materialized & In-Memory Analytical Aggregations Cache
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

export class AnalyticalCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Retrieves a cached value if present and not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Caches a value with a specific TTL in seconds and optional invalidation tags.
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300, tags: string[] = []): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest 10%
      const keysToDelete = Array.from(this.store.keys()).slice(0, Math.floor(this.maxEntries * 0.1));
      for (const k of keysToDelete) this.store.delete(k);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      tags,
    });
  }

  /**
   * Invalidates cached items matching a company or tag.
   */
  invalidateTag(tag: string): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.includes(tag)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get or compute with automatic caching.
   */
  async getOrCompute<T>(
    key: string,
    ttlSeconds: number,
    tagsOrCompute: string[] | (() => Promise<T> | T),
    maybeCompute?: () => Promise<T> | T,
  ): Promise<T> {
    const tags = Array.isArray(tagsOrCompute) ? tagsOrCompute : [];
    const compute = typeof tagsOrCompute === "function" ? tagsOrCompute : maybeCompute!;
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const computed = await compute();
    this.set(key, computed, ttlSeconds, tags);
    return computed;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const analyticalCache = new AnalyticalCache();
