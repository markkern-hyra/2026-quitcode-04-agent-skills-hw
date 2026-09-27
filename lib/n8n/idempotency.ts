import "server-only";

// Demo: process memory, like lib/db.ts. In production this is a table or KV with a
// unique constraint on the key; serverless handlers do not share memory.
type KeyState = "processing" | "done";
const globalForKeys = globalThis as unknown as { n8nCallbackKeyStates?: Map<string, KeyState> };
const keys = (globalForKeys.n8nCallbackKeyStates ??= new Map<string, KeyState>());

// "claimed": this delivery owns the key now. "processing": another delivery of the same callback is
// being saved right now (not done yet, so answer with a code n8n retries). "done": already saved.
export async function claimIdempotencyKey(key: string): Promise<"claimed" | KeyState> {
  const state = keys.get(key);
  if (state) return state;
  keys.set(key, "processing");
  return "claimed";
}

export async function completeIdempotencyKey(key: string): Promise<void> {
  keys.set(key, "done");
}

export async function releaseIdempotencyKey(key: string): Promise<void> {
  keys.delete(key);
}
