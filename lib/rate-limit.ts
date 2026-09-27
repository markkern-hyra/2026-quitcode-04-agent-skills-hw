import "server-only";

// Demo: a fixed window in process memory, like lib/db.ts. In production this is the
// platform's rate limiting or a shared KV: serverless instances do not share memory.

type Window = { count: number; resetAt: number };

const MAX_KEYS = 10_000;
const globalForLimits = globalThis as unknown as { rateLimitWindows?: Map<string, Window> };
const windows = (globalForLimits.rateLimitWindows ??= new Map<string, Window>());

// true = the request fits into `limit` per `windowMs` for this key, and is counted.
export function takeToken(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = windows.get(key);
  if (current && current.resetAt > now) {
    if (current.count >= limit) return false;
    current.count++;
    return true;
  }
  if (windows.size >= MAX_KEYS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    // Still full: someone is rotating keys. Fail closed rather than grow without bound.
    if (windows.size >= MAX_KEYS) return false;
  }
  windows.set(key, { count: 1, resetAt: now + windowMs });
  return true;
}
