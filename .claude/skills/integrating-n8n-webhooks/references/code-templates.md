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
import { usableCallbackSecret } from "./signature";

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // не більше двох повторів
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type TriggerResult = { ok: boolean; status: number | null; attempts: number };

function requireEnv(name: "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Токен іде в заголовку, тож лише HTTPS; http — тільки для n8n (чи мока) на цій машині.
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

// Повторюємо лише мережеву помилку, таймаут, 5xx і 524; 4xx — ні.
function isRetryable(status: number): boolean {
  return status >= 500;
}

export async function triggerWorkflow(
  event: string,
  data: Record<string, unknown>,
  options: { idempotencyKey: string; correlationId?: string; callback?: boolean },
): Promise<TriggerResult> {
  // Спершу конфігурація, поза повторами: відсутня чи хибна змінна — не тимчасовий збій.
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
  // Воркфлоу з колбеком відповідає 202 (Respond to Webhook). Інший 2xx — він дійшов до кінця без цього
  // вузла, і колбека не буде: це збій, і повтор його не виправить.
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
        redirect: "error", // токен і тіло не йдуть за перенаправленням на іншу адресу
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel(); // текст відповіді не читаємо — лише код статусу
      console.info("n8n.request", { event, correlationId, status, attempt, ms: Date.now() - started });
      if (accepted(status)) return { ok: true, status, attempts: attempt };
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

// Секрет колбека — якщо він є, не заглушка з .env.example і не короткий: такими підписати колбек міг би будь-хто.
export function usableCallbackSecret(): string | null {
  const secret = process.env.N8N_CALLBACK_SECRET;
  return secret && !secret.startsWith("change-me") && secret.length >= 32 ? secret : null;
}

// HMAC-SHA256(N8N_CALLBACK_SECRET, "<timestamp>.<сире тіло>"), заголовок — "sha256=<hex>".
export function isValidSignature(rawBody: string, timestamp: string, header: string | null): boolean {
  const secret = usableCallbackSecret();
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
type KeyState = "processing" | "done";
const globalForKeys = globalThis as unknown as { n8nCallbackKeyStates?: Map<string, KeyState> };
const keys = (globalForKeys.n8nCallbackKeyStates ??= new Map<string, KeyState>());

// "claimed" — ключ тепер належить цій доставці; "processing" — ту саму доставку саме зберігає інший запит
// (ще не готово, тож відповідь має дати n8n повторити); "done" — вже збережено, це дублікат.
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
```

## `lib/n8n/body.ts` — сире тіло з лімітом

```ts
import "server-only";

// Читає тіло як текст, але зупиняється (null), щойно воно перевищить maxBytes: Route Handler не має
// власного ліміту тіла, а content-length може бути відсутнім (chunked) чи неправдивим.
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks)); // той самий текст, що дав би request.text()
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
import { readBodyLimited } from "@/lib/n8n/body";
import { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } from "@/lib/n8n/idempotency";
import { isFreshTimestamp, isValidSignature } from "@/lib/n8n/signature";
import type { N8nCallback } from "@/lib/n8n/types";
import { applyQuoteResult } from "@/lib/quotes"; // фіча: зберігає результат у свій запис

const MAX_BODY_BYTES = 64 * 1024;

// Подія зі шляху → обробник, що зберігає стан і повертає false, якщо запису немає.
const HANDLERS: Record<string, (callback: N8nCallback) => Promise<boolean>> = {
  "quote-request": applyQuoteResult,
};

// Посилання стане <a href>: лише http(s), ніколи javascript: тощо.
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
    // Подія в тілі — подія цього шляху, а її суфікс — статус: жодного ".completed" зі статусом "failed".
    if (value.event !== `${event}.${data.status}`) return null;
    // Кожен статус несе свій результат: посилання на документ або код помилки.
    if (data.status === "completed" && !isHttpUrl(data.result?.documentUrl)) return null;
    if (data.status === "failed" && typeof data.error?.code !== "string") return null;
    return value as N8nCallback;
  } catch {
    return null;
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  // Object.hasOwn: інакше /api/n8n/constructor знайшов би Object.prototype.constructor і минув би 404
  const handler = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : undefined;
  if (!handler) return Response.json({ error: "not_found" }, { status: 404 });
  // Тип — точно application/json (параметри на кшталт charset дозволені; application/jsonp — ні)
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  // Розмір — до читання: content-length для швидкої відмови, далі читання з лімітом (у chunked-тіла
  // content-length немає). Route Handler розмір тіла не обмежує, а надіслати тіло можна й без секрету.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const raw = await readBodyLimited(request, MAX_BODY_BYTES); // сирий текст: підпис рахується від цих байтів
  if (raw === null) return Response.json({ error: "payload_too_large" }, { status: 413 });

  const timestamp = request.headers.get("x-n8n-timestamp");
  if (!isFreshTimestamp(timestamp) || !isValidSignature(raw, timestamp, request.headers.get("x-n8n-signature"))) {
    return new Response(null, { status: 401 });
  }

  const key = request.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "bad_request" }, { status: 400 });
  const claim = await claimIdempotencyKey(key);
  if (claim === "done") return Response.json({ duplicate: true }, { status: 200 });
  // Цю ж доставку саме зберігає інший запит: ще не готово, тож n8n має повторити.
  if (claim === "processing") return Response.json({ error: "in_progress" }, { status: 409 });

  const callback = parseCallback(raw, event); // JSON.parse — лише після перевірки підпису
  // Заголовок не підписано: він мусить дорівнювати jobId і події з підписаного тіла.
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
    await releaseIdempotencyKey(key); // інакше повтор n8n отримав би duplicate, і результат загубився б
    console.error("n8n.callback_failed", { event, error: (error as Error).name });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  await completeIdempotencyKey(key);

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
// updateQuote(id, patch, onlyIf) змінює запис, лише якщо його поточний статус в onlyIf (compare-and-set).
export async function applyQuoteResult(callback: N8nCallback): Promise<boolean> {
  const quote = await findQuoteByRequestKey(callback.data.requestIdempotencyKey);
  if (!quote) return false;
  if (callback.data.status === "failed") {
    // пізній "failed" не стирає вже готовий результат
    await updateQuote(quote.id, { status: "failed", documentUrl: null }, ["queued"]);
  } else {
    // "completed" — із queued або failed (n8n таки отримав запит), але не поверх готового
    await updateQuote(quote.id, { status: "ready", documentUrl: callback.data.result?.documentUrl ?? null }, ["queued", "failed"]);
  }
  return true; // запис є — колбек оброблено (202), навіть якщо стан не змінився
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
    try {
      const result = await triggerWorkflow(
        "quote-request",
        { quoteId: quote.id, company: quote.company, budget: quote.budget },
        { idempotencyKey: quote.requestKey, callback: true },
      );
      if (result.ok) return;
    } catch (error) {
      // конфігурація (змінна N8N_* чи APP_BASE_URL): повторювати нема чого, запис — у failed
      console.error("n8n.request_failed", { event: "quote-request", error: (error as Error).name });
    }
    await markQuoteFailed(quote.id);
  });

  return { status: "ok", id: quote.id };
}
```

- Подія без результату (`lead-created`, режим Immediately) — той самий `triggerWorkflow`, без `callback`, теж в
  `after()`: `triggerWorkflow("lead-created", { leadId: lead.id, source: lead.source }, { idempotencyKey })`.
- Сторінка статусу (`/quotes/[id]`) читає лише збережений стан (`queued` / `ready` / `failed`, посилання на
  документ) і не викликає n8n. Поки `queued`, її можна оновлювати (`router.refresh()` раз на кілька секунд).
