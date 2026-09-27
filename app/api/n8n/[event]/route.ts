import { after } from "next/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/n8n/idempotency";
import { isFreshTimestamp, isValidSignature } from "@/lib/n8n/signature";
import type { N8nCallback } from "@/lib/n8n/types";
import { applyQuoteResult } from "@/lib/quotes";

// Callbacks from n8n workflows (team contract: skill integrating-n8n-webhooks). A public
// endpoint: only the HMAC signature is trusted, and the checks run in exactly this order.

const MAX_BODY_BYTES = 64 * 1024;

// Event from the path -> handler that saves the result; false if there is no such record.
const HANDLERS: Record<string, (callback: N8nCallback) => Promise<boolean>> = {
  "quote-request": applyQuoteResult,
};

function parseCallback(raw: string): N8nCallback | null {
  try {
    const value = JSON.parse(raw) as Partial<N8nCallback> | null;
    const data = value?.data;
    if (value?.version !== 1 || typeof value.event !== "string" || !data) return null;
    if (typeof data.jobId !== "string" || typeof data.requestIdempotencyKey !== "string") return null;
    if (data.status !== "completed" && data.status !== "failed") return null;
    return value as N8nCallback;
  } catch {
    return null;
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  const handler = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : undefined;
  if (!handler) return Response.json({ error: "not_found" }, { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const raw = await request.text(); // raw text: the signature covers exactly these bytes
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const timestamp = request.headers.get("x-n8n-timestamp");
  if (!isFreshTimestamp(timestamp) || !isValidSignature(raw, timestamp, request.headers.get("x-n8n-signature"))) {
    return new Response(null, { status: 401 });
  }

  const key = request.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!(await claimIdempotencyKey(key))) return Response.json({ duplicate: true }, { status: 200 });

  const callback = parseCallback(raw); // JSON.parse only after the signature check
  const eventMatches = callback?.event === `${event}.completed` || callback?.event === `${event}.failed`;
  // The header is not signed: it must equal the signed body's jobId and event.
  if (!callback || !eventMatches || key !== `${callback.data.jobId}:${callback.event}`) {
    await releaseIdempotencyKey(key);
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (!(await handler(callback))) {
      await releaseIdempotencyKey(key);
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
  } catch (error) {
    await releaseIdempotencyKey(key); // otherwise n8n's retry would get "duplicate" and the result would be lost
    console.error("n8n.callback_failed", { event, error: (error as Error).name });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const correlationId = request.headers.get("x-correlation-id");
  after(() => {
    // slow follow-ups (emails, notifications) go here, after the response
    console.info("n8n.callback", { event, correlationId, status: callback.data.status });
  });
  return Response.json({ ok: true }, { status: 202 });
}
