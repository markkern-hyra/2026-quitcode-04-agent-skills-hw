---
name: integrating-n8n-webhooks
description: >-
  Контракт команди для зв'язки Next.js 16 ↔ n8n: виклик вебхука n8n із server-only модуля
  lib/n8n/client.ts (заголовки x-n8n-token, idempotency-key, x-correlation-id; конверт {version, event,
  data}; таймаут і повтори), Server Action без очікування n8n (after()), довгі воркфлоу — 202 + підписаний
  колбек у Route Handler (HMAC, вікно часу, ідемпотентність), змінні N8N_* і скрипт перевірки контракту.
  Застосовуй, коли код запускає воркфлоу n8n, шле дані у вебхук n8n, приймає колбек від n8n або змінює
  змінні N8N_* — навіть якщо в задачі сказано лише «воркфлоу» чи «n8n повідомить, коли готово».
  Тригери: «запусти воркфлоу в n8n», «відправ заявку в n8n», «вебхук n8n», «ендпоінт, який n8n викличе»,
  «колбек від n8n», «інтеграція з n8n», «воркфлоу працює хвилину».
  Не для: коду вузла Code в n8n, побудови чи імпорту воркфлоу в редакторі n8n, вебхуків інших сервісів
  (Stripe, GitHub).
metadata:
  owner: web-team
  version: "0.1.0"
---

# Інтеграція Next.js ↔ n8n

Форма запускає воркфлоу клієнта в n8n, а n8n повідомляє колбеком, коли результат готовий. Контракт нижче —
рішення команди: відхилятися від нього можна лише свідомо й письмово (у PR з поясненням), а не тому, що
«так згенерувалось». Деталі й «чому» — у `references/`, перевірка — [scripts/check-contract.mjs](scripts/check-contract.mjs).

## Коли застосовувати

- Код викликає вебхук n8n, запускає воркфлоу або приймає колбек від n8n.
- Додаються чи змінюються змінні `N8N_*`, `APP_BASE_URL`, `.env.example`.
- **Не** застосовувати: код вузла Code в n8n, побудова воркфлоу в редакторі, вебхуки інших сервісів.

## Контракт коротко

- **Змінні — лише серверні:** `N8N_WEBHOOK_BASE_URL` (закінчується на `/webhook`), `N8N_WEBHOOK_TOKEN`,
  `N8N_CALLBACK_SECRET`, `APP_BASE_URL`. Жодного `NEXT_PUBLIC_N8N_*`. У `.env.example` секрети — лише
  `change-me-…`, адреси — локальні. Справжні значення — лише `.env.local` і хостинг.
- **Запит:** `POST ${N8N_WEBHOOK_BASE_URL}/<event>` (подія в kebab-case, одна подія — один шлях), лише з
  `lib/n8n/client.ts`, перший рядок якого — `import "server-only"`. Заголовки: `content-type: application/json`,
  `x-n8n-token`, `idempotency-key` (UUID, створений **один раз** на операцію й збережений із записом),
  `x-correlation-id`. Тіло — конверт `{ "version": 1, "event", "data", "callbackUrl" }`; `data` — мінімум
  для воркфлоу, не рядок з бази. Адреса — лише `https://` (`http://` — тільки `127.0.0.1`/`localhost`),
  `redirect: "error"`: токен не йде за перенаправленням.
- **Таймаут і повтори:** кожна спроба — `signal: AbortSignal.timeout(10_000)`; не більше 2 повторів
  (пауза 1 с, потім 3 с) лише на мережеву помилку, таймаут, 5xx і 524, з тим самим `idempotency-key`.
  4xx і помилки конфігурації (змінна відсутня чи хибна) не повторюємо: конфігурацію перевіряємо до циклу.
  Дивимось лише на код статусу, текст відповіді не парсимо.
- **Режим:** усе, що може тривати до 100 с або довше (чи тривалість невідома), — асинхронно: n8n
  відповідає **202** (інший 2xx — колбека не буде, це збій), результат приходить колбеком на
  `POST /api/n8n/<event>`. Без придатного `N8N_CALLBACK_SECRET` такий воркфлоу не запускаємо.
- **Колбек** (`app/api/n8n/[event]/route.ts`), саме в такому порядку: невідома подія → 404, тип не рівно
  `application/json` → 415, `content-length` > 64 КБ → 413 (усе до читання тіла) → сире тіло потоком з лімітом
  64 КБ (понад — 413) → `x-n8n-timestamp` далі ніж ±300 с → 401 → підпис
  `sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "${timestamp}.${raw}")>` через перевірку довжини й
  `timingSafeEqual` (секрет-заглушка чи коротший за 32 символи — теж 401) → 401 → «застовпити» `idempotency-key`
  (вже збережено → 200 `{"duplicate":true}`, ще обробляється → 409) → лише тепер `JSON.parse` і перевірка форми:
  подія = `<подія>.<data.status>`, `completed` з http(s)-посиланням, `failed` з `error.code`,
  `idempotency-key === ${data.jobId}:${event}` → 400 (звільнити ключ) → зберегти стан дозволеним переходом
  (пізній `failed` не стирає `ready`) → **202** `{"ok":true}` → повільне в `after()`.

## Як робимо

1. **`lib/n8n/client.ts`** — один модуль з `import "server-only"`: функція запуску воркфлоу з конвертом,
   заголовками, таймаутом і повторами. Готовий шаблон — [references/code-templates.md](references/code-templates.md).
2. **Server Action** — публічний POST-ендпоінт: перевірка прав і валідація всередині (правило
   [`server-auth-actions`](../vercel-react-best-practices/rules/server-auth-actions.md) зі скіла Vercel). Дія
   зберігає запис зі статусом `queued` і своїм `idempotency-key`, повертає лише `{ status, id }`, а виклик n8n
   з повторами — в `after()` (правило
   [`server-after-nonblocking`](../vercel-react-best-practices/rules/server-after-nonblocking.md)); виняток
   конфігурації всередині `after()` перехоплюємо й переводимо запис у `failed`, інакше він лишиться `queued`.
   Next.js виконує дії одного клієнта по черзі: очікування n8n заблокувало б і наступні.
3. **Колбек-роут** `app/api/n8n/[event]/route.ts` — за порядком вище; запис знаходимо за
   `data.requestIdempotencyKey` (це ключ нашого запиту), `idempotency-key` колбека зберігаємо в сховищі з
   унікальністю. Шаблон — [references/code-templates.md](references/code-templates.md), пояснення кожного кроку — [references/callback.md](references/callback.md).
4. **Сторінка статусу** читає лише збережений стан (`queued` → `ready`/`failed`); n8n звідти не викликаємо.
5. **`.env.example`** — 4 ключі контракту; `.env.local` — ті самі ключі зі значеннями (секрети генеруємо:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`).
6. **Журнали:** подія, напрям, `x-correlation-id`, код, тривалість, номер спроби. Ніколи — тіла, ім'я,
   email, телефон, IP, токен, підпис, секрет. Помилки у відповідях — без подробиць. Див.
   [references/logging-and-limits.md](references/logging-and-limits.md).
7. **Налаштування n8n клієнта** передаємо словами, без JSON воркфлоу — [references/n8n-setup.md](references/n8n-setup.md).
8. Реєстр інтеграцій проєкту — рядок у `docs/n8n-integrations.md` на кожну подію.

## Чекліст

```text
- [ ] 1. Усі виклики n8n — лише з lib/n8n/client.ts; перший рядок — import "server-only".
- [ ] 2. Жодного NEXT_PUBLIC_N8N_*, жодного /webhook-test/ у коді й .env.example.
- [ ] 3. Заголовки x-n8n-token, idempotency-key, x-correlation-id у кожному запиті; тіло — конверт {version, event, data}.
- [ ] 4. AbortSignal.timeout(10_000) у кожному запиті; ≤ 2 повтори лише на мережу/таймаут/5xx/524, той самий ключ;
         конфігурацію перевірено до повторів; https (http — лише loopback); redirect: "error".
- [ ] 5. Server Action не чекає n8n: виклик — в after() з try/catch, відповідь — { status, id }.
- [ ] 6. Довгий воркфлоу — 202 (інший 2xx — збій) + колбек; callbackUrl = ${APP_BASE_URL}/api/n8n/<event>.
- [ ] 7. Колбек: тип рівно application/json → content-length → сире тіло з лімітом 64 КБ під час читання →
         час ±300 с → HMAC з перевіркою довжини й timingSafeEqual — до JSON.parse.
- [ ] 8. idempotency-key застовплено (done → 200, processing → 409) й звірено з ${data.jobId}:${event};
         подія = <подія>.<data.status>, у completed — http(s)-посилання, у failed — error.code; при помилці — звільнено.
- [ ] 9. Стан збережено до відповіді 202 дозволеним переходом (пізній failed не стирає ready); повільне — в after().
- [ ] 10. Ніде немає runtime = "edge"; у журналах немає тіл, персональних даних і секретів.
```

## Правила зупинки — зупинись і спитай людину, якщо:

- у задачі, коді чи `.env*` є тестовий URL (`/webhook-test/…`) або його «треба поставити, щоб запрацювало»;
- секрет або токен довелося б передати в Client Component, у query string, у журнал чи в `NEXT_PUBLIC_*`;
- виходить синхронне очікування воркфлоу, який може тривати до 100 с чи довше (або тривалість невідома);
- хочеться пропустити чи послабити перевірку підпису, вікна часу або ідемпотентності колбека;
- n8n потрібні дані понад мінімум: весь рядок з бази, IP, внутрішні нотатки, персональні дані без потреби;
- контракт треба змінити: імена заголовків, схему підпису, коди відповідей, імена змінних;
- для інтеграції «потрібна» нова залежність чи `runtime = "edge"`;
- немає події чи шляху вебхука, про які йдеться, — не вигадуй назву воркфлоу.

Жодних винятків «якщо задача цього потребує»: ці рішення приймає людина.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] `node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs` — 0 FAIL, код виходу 0
      (для власних змін: `--changed-since <ref>`).
- [ ] Мок n8n (справжній контракт, Header Auth, 202, підписаний колбек):
      `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000`
      → форма відповідає одразу, у журналі мока `POST /webhook/<event> -> 202 … auth=ok idempotency=new`,
      далі `callback POST … -> 202`, сторінка статусу показує результат.
- [ ] Матриця колбеків: `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/send-signed-callback.mjs --url http://127.0.0.1:3000/api/n8n/<event>`
      — усі випадки з очікуваним кодом (з `--request-key <ключ тестового запису>` — ще й 202, потім дублікат 200).
- [ ] Журнал сервера: немає тіл, email, телефонів, токенів і підписів.

## Файли скіла

- [references/contract.md](references/contract.md) — змінні, запит, конверт, таймаут і повтори, хто викликає; читати перед кодом
  клієнта й дії.
- [references/callback.md](references/callback.md) — колбек крок за кроком: коди, чому саме такий порядок, ідемпотентність.
- [references/response-modes.md](references/response-modes.md) — режими відповіді вебхука, ліміт 100 с / 524, тестовий і production URL.
- [references/code-templates.md](references/code-templates.md) — шаблони `lib/n8n/client.ts`, підпису, читання тіла з лімітом,
  ідемпотентності, колбек-роуту, Server Action, `.env.example`.
- [references/logging-and-limits.md](references/logging-and-limits.md) — що писати в журнал і чого ніколи; ліміти.
- [references/n8n-setup.md](references/n8n-setup.md) — налаштування вузлів n8n словами (для адміністратора n8n клієнта).
- [references/pitfalls.md](references/pitfalls.md) — відомі пастки документації й чужих скілів, межі скіла.
- [scripts/check-contract.mjs](scripts/check-contract.mjs) — статична перевірка контракту (`--help`, `--root`, `--changed-since`).
- [scripts/mock-n8n.mjs](scripts/mock-n8n.mjs) — офлайн-мок n8n (`--help`): режими відповіді, Header Auth, підписаний колбек.
- [scripts/send-signed-callback.mjs](scripts/send-signed-callback.mjs) — матриця колбеків проти роуту (`--help`).
