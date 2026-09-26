/**
 * Keyset / Cursor-Based Pagination Model
 * Feature 36: Database Performance Layer
 * Avoids expensive SQL OFFSET on large datasets.
 */

export interface CursorPageRequest {
  cursor?: string;
  limit?: number;
  direction?: "forward" | "backward";
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Encodes an object or timestamp into an opaque URL-safe base64 cursor.
 */
export function encodeCursor(val: Record<string, any> | string | number): string {
  const str = typeof val === "string" ? val : JSON.stringify(val);
  return Buffer.from(str, "utf8").toString("base64url");
}

/**
 * Decodes an opaque base64 cursor into the underlying value.
 */
export function decodeCursor<T = any>(cursor: string): T {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    return JSON.parse(raw) as T;
  } catch {
    return Buffer.from(cursor, "base64url").toString("utf8") as unknown as T;
  }
}

/**
 * Performs in-memory keyset/cursor pagination over a sorted list of records.
 * Sort key extractor extracts the monotonic comparator (e.g. date + id).
 */
export function paginateByCursor<T>(
  items: T[],
  limitOrRequest: number | CursorPageRequest = 50,
  cursorOrExtractor?: string | ((item: T) => string),
  getCursorValue?: (item: T) => string,
): Page<T> {
  const limit =
    typeof limitOrRequest === "number"
      ? limitOrRequest
      : limitOrRequest?.limit || 50;
  const cursor =
    typeof limitOrRequest === "object"
      ? limitOrRequest?.cursor
      : typeof cursorOrExtractor === "string"
      ? cursorOrExtractor
      : undefined;
  const extractor =
    typeof cursorOrExtractor === "function"
      ? cursorOrExtractor
      : getCursorValue || ((it: any) => it.id);

  const boundedLimit = Math.max(1, Math.min(limit, 200));

  let startIndex = 0;
  if (cursor) {
    const decodedVal = decodeCursor<string>(cursor);
    const foundIndex = items.findIndex((it) => extractor(it) === decodedVal);
    if (foundIndex >= 0) {
      startIndex = foundIndex + 1;
    }
  }

  const slice = items.slice(startIndex, startIndex + boundedLimit);
  const hasMore = startIndex + boundedLimit < items.length;
  const nextItem = slice.length > 0 ? slice[slice.length - 1] : undefined;
  const nextCursor = hasMore && nextItem ? encodeCursor(extractor(nextItem)) : undefined;

  const prevItem = startIndex > 0 ? items[Math.max(0, startIndex - 1)] : undefined;
  const prevCursor = startIndex > 0 && prevItem ? encodeCursor(extractor(prevItem)) : undefined;

  return {
    items: slice,
    nextCursor,
    prevCursor,
    hasMore,
    totalCount: items.length,
  };
}
