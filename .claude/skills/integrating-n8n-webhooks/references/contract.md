# Контракт: Next.js → n8n

Читати перед тим, як писати `lib/n8n/client.ts`, Server Action чи Route Handler, що запускає воркфлоу.

## Змінні середовища

Усі чотири — **лише серверні**. Next.js вбудовує в клієнтський бандл тільки змінні з префіксом
`NEXT_PUBLIC_`, тож жодна `N8N_*` цього префікса не має.

| Змінна | Що це | Локально |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | База production-URL вебхуків, закінчується на `/webhook` | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | Значення заголовка `x-n8n-token` = credential Header Auth в n8n | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | Секрет HMAC колбеків = Hmac Secret у Crypto credential в n8n | `change-me-callback-secret` |
| `APP_BASE_URL` | Адреса застосунку, за якою n8n бачить ендпоінти колбеків | `http://127.0.0.1:3000` |

- `.env.example` у git: ці ключі, секрети — лише `change-me-…`, адреси — локальні, ніколи `/webhook-test/`.
- Справжні значення — `.env.local` (у `.gitignore`) і налаштування хостингу.
- Секрет генеруємо, а не вигадуємо: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  Заглушку `change-me-…` чи секрет, коротший за 32 символи, колбек-роут не приймає (усі колбеки — 401): забутий
  на хостингу секрет не має дати підписувати колбеки будь-кому.
- Секрет і токен ніколи не йдуть у query string, Client Component чи журнал.

## Запит

`POST ${N8N_WEBHOOK_BASE_URL}/<event>`:

- `<event>` — ім'я події в kebab-case (`lead-created`, `quote-request`). Одна подія — один шлях: n8n дозволяє
  лише один вебхук на пару «шлях + метод».
- Код запиту — лише в `lib/n8n/client.ts`; перший рядок модуля — `import "server-only"` (тоді імпорт з Client
  Component — помилка збірки). Прямих `fetch` до n8n поза цим модулем немає.

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID, створений **один раз** на бізнес-операцію й збережений разом із записом; у повторах — той самий |
| `x-correlation-id` | UUID ланцюжка дій; його ж пишемо в журнали обох систем |

Тіло — конверт:

```json
{
  "version": 1,
  "event": "quote-request",
  "data": { "quoteId": "q_0042", "company": "Nova Dental", "budget": 1500 },
  "callbackUrl": "http://127.0.0.1:3000/api/n8n/quote-request"
}
```

- `version` — версія конверта. Нове необов'язкове поле — та сама версія; перейменування чи зміна сенсу поля —
  нова версія, і воркфлоу якийсь час приймає обидві.
- `data` — **мінімум**, потрібний воркфлоу: не рядок з бази, без IP, user agent, внутрішніх нотаток і сирих
  даних форми.
- `callbackUrl` — лише для асинхронних воркфлоу: `${APP_BASE_URL}/api/n8n/<event>`.

## Таймаут і повтори

- Кожна спроба — `fetch(url, { …, signal: AbortSignal.timeout(10_000) })`; по закінченні `fetch` кидає
  `TimeoutError`. 10 с — наше рішення: в асинхронному режимі n8n відповідає одразу після отримання запиту,
  тож довга відповідь — це збій, а не «повільний воркфлоу».
- Не більше **двох** повторів (разом три спроби), пауза 1 с, потім 3 с, і **лише** для мережевої помилки,
  таймауту, 5xx і 524. Завжди з тим самим `idempotency-key` — в n8n за вебхуком стоїть Remove Duplicates.
- 4xx не повторюємо: 403 — неправильний токен, 404 — воркфлоу не опубліковано або це тестовий URL. Такі
  помилки виправляють, а не повторюють.

## Відповідь n8n

Дивимось лише на **код статусу**. Текст не парсимо: для режиму Immediately документація пише «Workflow got
started», а код n8n повертає `{"message":"Workflow was started"}`. Для 202 тіло `{"job_id": …}` нам не
потрібне: колбек сам несе `data.jobId` і `data.requestIdempotencyKey` (ключ нашого запиту), за яким
знаходимо запис.

## Хто викликає

- **Дія з UI — Server Action.** Це публічний POST-ендпоінт: автентифікація, права й валідація — всередині
  (правило `server-auth-actions` скіла `vercel-react-best-practices`).
- **Користувач не чекає на n8n.** Дія зберігає запис (статус `queued`, власний `idempotency-key`), повертає
  лише `{ status, id }`, а виклик n8n з повторами — в `after()` з `next/server` (правило
  `server-after-nonblocking`). Причина не лише швидкість: Next.js виконує Server Actions одного клієнта по
  черзі, тож довге очікування блокує наступну дію того ж користувача.
- Якщо виклик n8n остаточно не вдався — позначити запис (`failed`), щоб сторінка статусу це показала.
- **Не-React клієнт** (інший сервіс, cron) — Route Handler.
- **Ніколи `export const runtime = "edge"`**: у Next.js 16 `edge` застарілий, а нам потрібен `node:crypto`.
