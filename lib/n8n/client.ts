import "server-only";
import { randomUUID } from "node:crypto";
import { usableCallbackSecret } from "./signature";

// The only place that sends requests to n8n (team contract: skill integrating-n8n-webhooks).

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // at most two retries
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type TriggerResult = { ok: boolean; status: number | null; attempts: number };

function requireEnv(name: "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// The token travels in a header, so only HTTPS; plain http only for n8n (or the mock) on this machine.
function webhookUrl(event: string): URL {
  const url = new URL(`${requireEnv("N8N_WEBHOOK_BASE_URL")}/${event}`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error("N8N_WEBHOOK_BASE_URL must use https (http only for 127.0.0.1 or localhost)");
  }
  return url;
}

export function callbackUrlFor(event: string): string {
  return new URL(`${requireEnv("APP_BASE_URL")}/api/n8n/${event}`).toString();
}

// Retry only network errors, timeouts, 5xx and 524; never 4xx (wrong token, unpublished workflow).
function isRetryable(status: number): boolean {
  return status >= 500;
}

export async function triggerWorkflow(
  event: string,
  data: Record<string, unknown>,
  options: { idempotencyKey: string; correlationId?: string; callback?: boolean },
): Promise<TriggerResult> {
  // Configuration first, outside the retries: a missing or wrong variable is not a transient failure.
  const url = webhookUrl(event);
  const token = requireEnv("N8N_WEBHOOK_TOKEN");
  if (options.callback && !usableCallbackSecret()) {
    throw new Error("N8N_CALLBACK_SECRET is not set: the callback would be rejected");
  }
  const correlationId = options.correlationId ?? randomUUID();
  const envelope = {
    version: 1,
    event,
    data,
    ...(options.callback ? { callbackUrl: callbackUrlFor(event) } : {}),
  };
  const payload = JSON.stringify(envelope);
  // A workflow with a callback answers 202 (Respond to Webhook). Any other 2xx means it ran without
  // that node, so no callback will come: a failure, and not one a retry would fix.
  const accepted = (status: number) => (options.callback ? status === 202 : status >= 200 && status < 300);
  let status: number | null = null;

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": token,
          "idempotency-key": options.idempotencyKey,
          "x-correlation-id": correlationId,
        },
        body: payload,
        redirect: "error", // never forward the token and the body to another address
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel(); // only the status code matters, the text is never read
      console.info("n8n.request", { event, correlationId, status, attempt, ms: Date.now() - started });
      if (accepted(status)) return { ok: true, status, attempts: attempt };
      if (!isRetryable(status)) return { ok: false, status, attempts: attempt };
    } catch (error) {
      // network error or TimeoutError
      console.warn("n8n.request_failed", { event, correlationId, attempt, error: (error as Error).name });
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return { ok: false, status, attempts: RETRY_DELAYS_MS.length + 1 };
}
