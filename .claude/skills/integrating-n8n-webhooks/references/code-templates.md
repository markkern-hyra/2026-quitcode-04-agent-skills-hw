# Шаблони коду (Next.js 16, App Router)

Шаблони проходять `scripts/check-contract.mjs` без FAIL, `npm run lint` і `npm run build`, а колбек-роут —
усю матрицю `scripts/send-signed-callback.mjs`. Імена подій, полів і модулів фічі (`@/lib/quotes`)
підставте під задачу. Пакет `server-only` ставити не треба: Next.js обробляє `import "server-only"` сам
(документація Next.js 16, «Server and Client Components»).

## `.env.example`

```bash
# n8n — лише серверні змінні; справжні значення — лише в .env.local і в налаштуваннях хостингу
N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook
N8N_WEBHOOK_TOKEN=change-me-webhook-token
N8N_CALLBACK_SECRET=change-me-callback-secret
APP_BASE_URL=http://127.0.0.1:3000
```

## `lib/n8n/client.ts` — єдине місце, звідки йдуть запити до n8n

```ts
import "server-only";
import { randomUUID } from "node:crypto";

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // не більше двох повторів

export type TriggerResult = { ok: boolean; status: number | null; attempts: number };

function requireEnv(name: "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function callbackUrlFor(event: string): string {
  return `${requireEnv("APP_BASE_URL")}/api/n8n/${event}`;
}

// Повторюємо лише мережеву помилку, таймаут, 5xx і 524; 4xx — ні.
function isRetryable(status: number): boolean {
  return status >= 500;
}

export async function triggerWorkflow(
  event: string,
  data: Record<string, unknown>,
  options: { idempotencyKey: string; correlationId?: string; callback?: boolean },
): Promise<TriggerResult> {
  const url = `${requireEnv("N8N_WEBHOOK_BASE_URL")}/${event}`;
  const correlationId = options.correlationId ?? randomUUID();
  const envelope = {
    version: 1,
    event,
    data,
    ...(options.callback ? { callbackUrl: callbackUrlFor(event) } : {}),
  };
  const payload = JSON.stringify(envelope);
  let status: number | null = null;

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": requireEnv("N8N_WEBHOOK_TOKEN"),
          "idempotency-key": options.idempotencyKey,
          "x-correlation-id": correlationId,
        },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel(); // текст відповіді не читаємо — лише код статусу
      console.info("n8n.request", { event, correlationId, status, attempt, ms: Date.now() - started });
      if (response.ok) return { ok: true, status, attempts: attempt };
      if (!isRetryable(status)) return { ok: false, status, attempts: attempt };
    } catch (error) {
      // мережева помилка або TimeoutError
      console.warn("n8n.request_failed", { event, correlationId, attempt, error: (error as Error).name });
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return { ok: false, status, attempts: RETRY_DELAYS_MS.length + 1 };
}
```

## `lib/n8n/signature.ts` — перевірка часу й підпису колбека

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_WINDOW_SECONDS = 300;

export function isFreshTimestamp(timestamp: string | null, now = Date.now()): timestamp is string {
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  return Math.abs(Math.floor(now / 1000) - Number(timestamp)) <= SIGNATURE_WINDOW_SECONDS;
}

// HMAC-SHA256(N8N_CALLBACK_SECRET, "<timestamp>.<сире тіло>"), заголовок — "sha256=<hex>".
export function isValidSignature(rawBody: string, timestamp: string, header: string | null): boolean {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const given = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
```

## `lib/n8n/idempotency.ts` — «застовпити» й звільнити ключ колбека

```ts
import "server-only";

// Демо: пам'ять процесу. У продакшні — таблиця чи KV з унікальним обмеженням на ключ.
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
```

## `lib/n8n/types.ts` — форма колбека

```ts
export type N8nCallback = {
  version: 1;
  event: string; // "<подія>.completed" | "<подія>.failed"
  data: {
    jobId: string;
    status: "completed" | "failed";
    correlationId?: string;
    requestIdempotencyKey: string; // ключ нашого запиту до n8n — за ним знаходимо запис
    result?: { documentUrl?: string };
    error?: { code?: string };
    completedAt?: string;
  };
};
```

## `app/api/n8n/[event]/route.ts` — колбек

```ts
import { after } from "next/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/n8n/idempotency";
import { isFreshTimestamp, isValidSignature } from "@/lib/n8n/signature";
import type { N8nCallback } from "@/lib/n8n/types";
import { applyQuoteResult } from "@/lib/quotes"; // фіча: зберігає результат у свій запис

const MAX_BODY_BYTES = 64 * 1024;

// Подія зі шляху → обробник, що зберігає стан і повертає false, якщо запису немає.
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
  const handler = HANDLERS[event];
  if (!handler) return Response.json({ error: "not_found" }, { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const raw = await request.text(); // сирий текст: підпис рахується від цих байтів
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

  const callback = parseCallback(raw); // JSON.parse — лише після перевірки підпису
  const eventMatches = callback?.event === `${event}.completed` || callback?.event === `${event}.failed`;
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
    await releaseIdempotencyKey(key); // інакше повтор n8n отримав би duplicate, і результат загубився б
    console.error("n8n.callback_failed", { event, error: (error as Error).name });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const correlationId = request.headers.get("x-correlation-id");
  after(() => {
    // повільне (листи, сповіщення) — тут, після відповіді
    console.info("n8n.callback", { event, correlationId, status: callback.data.status });
  });
  return Response.json({ ok: true }, { status: 202 });
}
```

## Фіча: запис і обробник результату (ескіз `lib/quotes.ts`)

```ts
import "server-only";
import type { N8nCallback } from "@/lib/n8n/types";

// createQuote({ …, status: "queued", requestKey: randomUUID() }) — ключ створюється один раз і живе в записі.
export async function applyQuoteResult(callback: N8nCallback): Promise<boolean> {
  const quote = await findQuoteByRequestKey(callback.data.requestIdempotencyKey);
  if (!quote) return false;
  await updateQuote(quote.id, {
    status: callback.data.status === "completed" ? "ready" : "failed",
    documentUrl: callback.data.result?.documentUrl ?? null,
  });
  return true;
}
```

## Server Action — запуск довгого воркфлоу

```ts
"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { triggerWorkflow } from "@/lib/n8n/client";

export async function requestQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const parsed = parseQuoteForm(formData); // валідація всередині дії (server-auth-actions)
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };

  const quote = await createQuote({ ...parsed.data, status: "queued", requestKey: randomUUID() });

  after(async () => {
    // користувач не чекає на n8n (server-after-nonblocking); data — мінімум для воркфлоу
    const result = await triggerWorkflow(
      "quote-request",
      { quoteId: quote.id, company: quote.company, budget: quote.budget },
      { idempotencyKey: quote.requestKey, callback: true },
    );
    if (!result.ok) await markQuoteFailed(quote.id);
  });

  return { status: "ok", id: quote.id };
}
```

- Подія без результату (`lead-created`, режим Immediately) — той самий `triggerWorkflow`, без `callback`, теж в
  `after()`: `triggerWorkflow("lead-created", { leadId: lead.id, source: lead.source }, { idempotencyKey })`.
- Сторінка статусу (`/quotes/[id]`) читає лише збережений стан (`queued` / `ready` / `failed`, посилання на
  документ) і не викликає n8n. Поки `queued`, її можна оновлювати (`router.refresh()` раз на кілька секунд).
