# Інтеграції з n8n

Реєстр подій між LeadDesk і n8n клієнта. Контракт (заголовки, конверт, підпис колбека, змінні `N8N_*`) —
скіл `.claude/skills/integrating-n8n-webhooks`. Один рядок на подію.

| Подія | Напрям | Режим | Вебхук n8n | Колбек | `data` у запиті | Хто запускає | Стан |
|---|---|---|---|---|---|---|---|
| `quote-request` | Next.js → n8n → Next.js | асинхронний: 202 + колбек (воркфлоу 40–90 с) | `POST ${N8N_WEBHOOK_BASE_URL}/quote-request` | `POST ${APP_BASE_URL}/api/n8n/quote-request`, події `quote-request.completed` / `quote-request.failed`, `data.result.documentUrl` — посилання на PDF | `quoteId`, `company`, `budget`, `description` (без email) | Server Action `requestQuote` (`app/quotes/actions.ts`), форма `/quotes/new`; статус — `/quotes/[id]` | за контрактом |
| `lead-created` | Next.js → n8n | «до відома»: Immediately, без колбека | `POST ${N8N_WEBHOOK_BASE_URL}/lead-created` | — | `leadId`, `source` | Server Action `submitLead` (`app/actions.ts`), форма на `/` | за контрактом у коді; **воркфлоу в n8n треба оновити** (див. нижче) |

## `quote-request`: що налаштувати в n8n клієнта

Воркфлоу вже опублікований; щоб він працював із LeadDesk, у ньому має бути таке (передати адміністратору n8n):

1. **Webhook:** `POST`, Path `quote-request`. Authentication — Header Auth, credential з Name `x-n8n-token`
   і Value = значення `N8N_WEBHOOK_TOKEN` (передаємо окремо, не в чаті й не в тікеті). Respond — «Using
   'Respond to Webhook' Node». Тіло запиту — `$json.body` (конверт `{version, event, data, callbackUrl}`),
   заголовки — `$json.headers`.
2. **Remove Duplicates** одразу за Webhook: «Remove Items Processed in Previous Executions», значення —
   заголовок `idempotency-key`. LeadDesk повторює запит (до 3 спроб) з тим самим ключем.
3. **Respond to Webhook** одразу після цього: JSON, код **202**, тіло `{"job_id": "<id виконання>"}`.
   Чекати на PDF до відповіді не можна: на n8n Cloud через 100 с запит обривається з 524.
4. Генерація PDF. Сам файл у колбек не кладемо — лише посилання (`http`/`https`), доступне клієнту.
5. **Колбек:** тіло — рядок JSON `{"version":1,"event":"quote-request.completed","data":{"jobId":<id виконання>,
   "status":"completed","correlationId":<заголовок x-correlation-id запиту>,"requestIdempotencyKey":<заголовок
   idempotency-key запиту>,"result":{"documentUrl":<посилання на PDF>},"completedAt":<ISO-час>}}`. Якщо PDF не
   вийшов — `"event":"quote-request.failed"`, `"status":"failed"`, `"error":{"code":…}` замість `result`.
6. **Crypto** (v2): Hmac, SHA256, HEX від рядка `<ts>.<тіло>`, де `ts` — Unix-час у секундах; credential
   Crypto з Hmac Secret = значення `N8N_CALLBACK_SECRET`.
7. **HTTP Request:** `POST` на `callbackUrl` з тіла запиту. Заголовки: `x-n8n-timestamp` = `ts`,
   `x-n8n-signature` = `sha256=` + результат Crypto, `idempotency-key` = `<jobId>:<event>` (ті самі значення,
   що в тілі), `x-correlation-id` — з вхідного запиту. Body — Raw, `application/json`, **той самий рядок**, що
   підписаний. Timeout 10000; Retry On Fail — 3 спроби, пауза 1000 мс.
8. Save і **Publish** (після кожної зміни — Publish знову).

## `lead-created`: що змінилося й що оновити в n8n

Раніше LeadDesk слав на тестовий URL (`/webhook-test/lead-created`, змінна `N8N_WEBHOOK_URL`) увесь запис
ліда — з email, телефоном, IP, user agent і сирими даними форми — без токена й таймауту. Тепер:

- адреса — production `${N8N_WEBHOOK_BASE_URL}/lead-created`; змінну `N8N_WEBHOOK_URL` більше ніхто не
  читає — на хостингу замінити на чотири змінні контракту;
- тіло — конверт `{"version":1,"event":"lead-created","data":{"leadId","source"}}`, контакти лишаються в
  LeadDesk (менеджер відкриває лід у дашборді);
- заголовки `x-n8n-token`, `idempotency-key`, `x-correlation-id`; до 3 спроб з тим самим ключем.

У воркфлоу: Webhook з Path `lead-created`, Header Auth (як у `quote-request`), Respond — Immediately; одразу
за ним Remove Duplicates за заголовком `idempotency-key`; поля — з `$json.body.data`. **Опублікувати**
(production URL працює лише в опублікованому воркфлоу). Якщо воркфлоу справді потрібні контакти ліда —
додати в `data` лише потрібні поля, свідомо й із записом тут.

## Загальне

`APP_BASE_URL` має бути адресою, яку n8n бачить ззовні: `http://127.0.0.1:3000` годиться лише для локального
мока. Відповіді LeadDesk на колбек: 202 — прийнято, 200 `{"duplicate":true}` — повтор, 400/401/404/413/415 —
помилка налаштування (повторювати без виправлення марно).
