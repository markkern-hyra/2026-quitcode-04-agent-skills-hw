import { after } from "next/server";
import { readBodyLimited } from "@/lib/n8n/body";
import { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } from "@/lib/n8n/idempotency";
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

// The link is rendered as <a href>: http(s) only, never javascript: and the like.
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function parseCallback(raw: string, event: string): N8nCallback | null {
  try {
    const value = JSON.parse(raw) as Partial<N8nCallback> | null;
    const data = value?.data;
    if (value?.version !== 1 || !data) return null;
    if (typeof data.jobId !== "string" || typeof data.requestIdempotencyKey !== "string") return null;
    if (data.status !== "completed" && data.status !== "failed") return null;
    // The body's event is this path's event, and its suffix is the status: no ".completed" that says "failed".
    if (value.event !== `${event}.${data.status}`) return null;
    // Each status carries its result: a document link, or an error code.
    if (data.status === "completed" && !isHttpUrl(data.result?.documentUrl)) return null;
    if (data.status === "failed" && typeof data.error?.code !== "string") return null;
    return value as N8nCallback;
  } catch {
    return null;
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  const handler = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : undefined;
  if (!handler) return Response.json({ error: "not_found" }, { status: 404 });
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  // Size before reading: content-length for a quick refusal, then a bounded read (a chunked body has
  // no content-length). A Route Handler does not limit the body itself; no secret is needed to send one.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const raw = await readBodyLimited(request, MAX_BODY_BYTES); // raw text: the signature covers exactly these bytes
  if (raw === null) return Response.json({ error: "payload_too_large" }, { status: 413 });

  const timestamp = request.headers.get("x-n8n-timestamp");
  if (!isFreshTimestamp(timestamp) || !isValidSignature(raw, timestamp, request.headers.get("x-n8n-signature"))) {
    return new Response(null, { status: 401 });
  }

  const key = request.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "bad_request" }, { status: 400 });
  const claim = await claimIdempotencyKey(key);
  if (claim === "done") return Response.json({ duplicate: true }, { status: 200 });
  // Another delivery of this callback is being saved right now: not done yet, so n8n should retry.
  if (claim === "processing") return Response.json({ error: "in_progress" }, { status: 409 });

  const callback = parseCallback(raw, event); // JSON.parse only after the signature check
  // The header is not signed: it must equal the signed body's jobId and event.
  if (!callback || key !== `${callback.data.jobId}:${callback.event}`) {
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
  await completeIdempotencyKey(key);

  const correlationId = request.headers.get("x-correlation-id");
  after(() => {
    // slow follow-ups (emails, notifications) go here, after the response
    console.info("n8n.callback", { event, correlationId, status: callback.data.status });
  });
  return Response.json({ ok: true }, { status: 202 });
}
