import "server-only";

// Demo: process memory, like lib/db.ts. In production this is a table or KV with a
// unique constraint on the key; serverless handlers do not share memory.
const globalForKeys = globalThis as unknown as { n8nCallbackKeys?: Set<string> };
const claimed = (globalForKeys.n8nCallbackKeys ??= new Set<string>());

export async function claimIdempotencyKey(key: string): Promise<boolean> {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export async function releaseIdempotencyKey(key: string): Promise<void> {
  claimed.delete(key);
}
