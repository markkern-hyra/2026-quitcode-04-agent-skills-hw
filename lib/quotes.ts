import "server-only";
import { db } from "./db";
import type { N8nCallback } from "./n8n/types";

// The link is rendered as <a href> on a public page: accept only http(s), never javascript: etc.
function documentUrlFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Callback handler for "quote-request". false = no such quote or an unusable result (the route answers 400).
// Allowed transitions only: "failed" from queued; "completed" from queued or failed (n8n got the
// request after all), never over a ready quote. A callback that changes nothing is still handled (202).
export async function applyQuoteResult(callback: N8nCallback): Promise<boolean> {
  const quote = await db.getQuoteByRequestKey(callback.data.requestIdempotencyKey);
  if (!quote) return false;

  if (callback.data.status === "failed") {
    await db.updateQuote(quote.id, { status: "failed", documentUrl: null }, "queued");
    return true;
  }
  const documentUrl = documentUrlFrom(callback.data.result?.documentUrl);
  if (!documentUrl) return false;
  await db.updateQuote(quote.id, { status: "ready", documentUrl }, ["queued", "failed"]);
  return true;
}

// The trigger gave up. Only a quote that is still queued: a result that already
// arrived by callback (n8n got the request after all) must stay.
export async function markQuoteFailed(id: string) {
  await db.updateQuote(id, { status: "failed" }, "queued");
}
