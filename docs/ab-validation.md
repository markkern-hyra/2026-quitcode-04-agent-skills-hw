# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

Протокол — `materials/ab-task.md`, команди — `docs/walkthrough.md`, Task D. **A — без скіла, B — зі скілом.**
Усе нижче — з журналів сесій (stream-json), журналів мока й сервера; числа не з пам'яті.

- **Інструмент і версія:** Claude Code 2.1.283 (CLI з розширення VS Code), headless `claude -p`
- **Модель і рівень міркування (effort), однакові в обох прогонах:** Opus 5.5 (`claude-opus-5-5`), effort xhigh
- **Код:** BASE = `ffbb903` (коміт після Task C: три скіли й виправлення Task A, ще без `/quotes` і змін у
  виклику n8n) · скіл `integrating-n8n-webhooks` для копії B — з `9f39a65` (HEAD на момент копіювання; скіл
  у ньому той самий, що в `ffbb903`)
- **Копії:** `../leaddesk-ab-a` (без жодного скіла), `../leaddesk-ab-b` (лише `integrating-n8n-webhooks`);
  у кожній — коміт `start` з тегом `base`, залежності — `npm ci` (lockfile не змінився, `git status` порожній)
- **Що видалено з обох копій:** `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/`
  і всі скіли (у B повернуто лише `integrating-n8n-webhooks`). Перевірено командами кроку 1:
  `find … -name SKILL.md` — один рядок, `../leaddesk-ab-b/.claude/skills/integrating-n8n-webhooks/SKILL.md`;
  `ls -A … | grep` — «no hints - ok»; `grep x-n8n-token|timingSafeEqual|idempotency-key` у копії A —
  «no contract - ok». Ширший `grep` у копії A (`x-correlation-id`, `x-n8n-`, `callbackUrl`, `createHmac`,
  `AbortSignal.timeout`, `server-only`, `after(`) — нічого; `n8n` згадано лише в старому коді BASE
  (`app/actions.ts:61`, коментар `.env.example`), однаковому в обох копіях.
- **Особисті копії скіла:** `~/.claude/skills` і `~/.agents/skills` — лише `no-mistakes`; `~/.cursor/skills`,
  `~/.codex/skills` — немає. У жодному особистому, синхронізованому чи плагінному скілі (39 `SKILL.md`)
  немає згадок n8n чи термінів контракту; `~/.claude/CLAUDE.md` немає.
- **Ізоляція:** `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` — у записі `init` обох прогонів
  `mcp_servers: []`, 0 MCP-інструментів (конектори claude.ai, зокрема n8n, не завантажені).
- **Дозволи, однакові в обох:** `--permission-mode acceptEdits`, `--allowedTools Skill Read Grep Glob
  "Bash(npm run lint)" "Bash(npm run build)" "Bash(node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs*)"`
  (останнє в A нешкідливе — файлу там немає). Решту Bash, доступ поза текою копії й веб-інструменти headless
  відхиляє сам. Прості команди лише для читання (`git ls-files`, `ls`) Claude Code дозволяє й без списку — однаково
  в обох прогонах.
- **Запит:** `materials/ab-task.md`, рядки 14–18, без змін (589 байт, sha256 `498a125e…c39c`, звірено `diff`),
  через stdin; нова сесія на кожен прогін.
- **Відповідь на уточнення, однакова в обох:** обидва агенти закінчили першу сесію запитаннями до людини — кожен
  продовжено **один раз** (`--resume`, ті самі прапорці) текстом «Роби, як вважаєш правильним».
- **Мок, однаковий для обох** (з робочого репозиторію, у теці копії):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`
  (без `--callback-url`). `.env.local` копії — змінні, які додав агент, зі значеннями для мока, плюс
  `N8N_WEBHOOK_TOKEN` і `N8N_CALLBACK_SECRET` (згенеровані, не виводились).
- **Як відправляли форму:** за рішенням автора — не браузер, а відправка **без JavaScript**: GET
  `/quotes/new`, приховані поля `$ACTION_*` з форми + поля форми, `POST multipart/form-data` з
  `Origin`; час — від відправки до кінця відповіді; потім GET `/quotes/<id>` одразу й через 8 с.
  Застосунок — продакшн-збірка (`npm run build && npm start`).
- **Базова лінія `check-contract.mjs` на копії до прогону** (увесь код): 3 PASS, 7 FAIL, 4 N/A — C1
  (`.env.example:6`), C3–C7 (`app/actions.ts:55`, старий `submitLead`), C13; C8–C11 — N/A (колбек-роуту
  немає). Однаково в A і B. Це старий код, в оцінку прогонів він не йде.

## A — без скіла

- Які скіли бачив агент (окремий `/context`): проєктних — жодного; `no-mistakes` (User), 8 × `airtable:*`
  (Plugin), вбудовані та синхронізовані з claude.ai — про документи, не про n8n.
- Що зробив агент: сторінки `/quotes/new` і `/quotes/[id]` (автооновлення кожні 5 с), Server Action
  `requestQuote`, колбек `POST /api/quotes/<id>/callback`. Власний контракт: дія **чекає** на n8n
  (`fetch` з `AbortSignal.timeout(10_000)`; коментар у коді — «we only wait for n8n to accept the job») і лише потім
  `redirect`; у вебхук іде весь розібраний запит — компанія, **email, опис**, бюджет — плюс
  `callback: { url, token }`; колбек перевіряє `Authorization: Bearer <token>` (у сховищі — sha256 токена,
  `timingSafeEqual`), тіло не підписане, вікна часу й ключа ідемпотентності немає. Без заголовків
  `x-n8n-token`, `idempotency-key`, `x-correlation-id`, без конверта.
- Звідки агент узяв домовленості: з журналу — наявний код (`app/actions.ts`, `lib/lead-form.ts`,
  `components/lead-form.tsx`) і документація Next.js у `node_modules/next/dist/docs/`: `server-actions.md`,
  `route.md`, `after.md`, `refresh.md`, `backend-for-frontend.md`. `after.md` агент прочитав, але виклик n8n
  лишив у дії синхронним. Схема з Bearer-токеном на кожен запит — власне рішення, джерела в журналі немає.
  Поза текою копії агент нічого не читав; писав лише у власний тимчасовий каталог сесії (мок і e2e-скрипт).
- Запитання агента і фінальна відповідь (скорочено):
  > Сторінки `/quotes/new` і `/quotes/[id]`, Server Action і callback-ендпоінт готові. `npm run lint` і
  > `npm run build` проходять. Наскрізну перевірку я не запустив … Я не бачив сам воркфлоу, тому формат
  > даних визначив я. Його треба погодити з тим, що вже є в n8n … **Немає обмеження частоти запитів** …
  > Запустити тест? Ще можу покласти мок у `tools/`, щоб ним користувалися інші в команді.

  Після «Роби, як вважаєш правильним»: ще тричі спробував запустити свій мок, `next start` і e2e — усе
  відхилено; «Мок у репозиторій не додаю … Не комічу». Код у копії не змінився.
- Сесія: 67 кроків, ~8 хв (453 + 33 с), $2,38; 8 відхилених команд (запуск серверів і складені Bash).
- Змінені файли (`git diff --cached --stat base`): 13 файлів, +534/−1 — `.env.example`,
  `app/api/quotes/[id]/callback/route.ts`, `app/quotes/{[id]/page,actions,layout,new/page}.tsx|ts`,
  `components/{auto-refresh,quote-form}.tsx`, `lib/{data,db,quote-callback,quote-form,types}.ts`;
  діф: `docs/ab/a-without-skill.diff`
- Змінні середовища, які додав агент: `N8N_QUOTE_WEBHOOK_URL`, `APP_URL` (старий `N8N_WEBHOOK_URL` з тестовим
  URL лишився).
- `check-contract.mjs --root ../leaddesk-ab-a --changed-since base` (поточна версія скрипта; версія на BASE дала
  ті самі 8 FAIL за тими самими id):
  ```text
  check-contract (n8n) - root: …/leaddesk-ab-a - changed since base (13 file(s) changed)
  C1   PASS  No test webhook URLs (/webhook-test/) in code or .env.example (1 finding(s) in unchanged code ignored)
  C2   PASS  n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)
  C3   FAIL  n8n is called only from lib/n8n/client.ts, which starts with import "server-only" (1 finding(s) in unchanged code ignored)
        app/quotes/actions.ts:30 - request to n8n outside lib/n8n/client.ts
  C4   PASS  Every request to n8n has a timeout (signal: AbortSignal.timeout(...)) (1 finding(s) in unchanged code ignored)
  C5   FAIL  Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id (1 finding(s) in unchanged code ignored)
        app/quotes/actions.ts:30 - missing header(s) on this request: x-n8n-token, idempotency-key, x-correlation-id
  C6   FAIL  The request body is an envelope {version, event, data}, not a raw record (1 finding(s) in unchanged code ignored)
        app/quotes/actions.ts:30 - the body is not an envelope { version: 1, event, data }
  C7   FAIL  Server Actions do not wait for n8n (the call runs inside after()) (1 finding(s) in unchanged code ignored)
        app/quotes/actions.ts:30 - the Server Action waits for n8n: move the call into after()
  C8   PASS  Callback reads the raw body (request.text()) and parses JSON only after the signature check
  C9   FAIL  Callback signature: HMAC with a length check + timingSafeEqual, never ===
        lib/quote-callback.ts:18 - no HMAC of the body: verify sha256=HMAC(N8N_CALLBACK_SECRET, "<timestamp>.<raw body>")
        lib/quote-callback.ts:18 - timingSafeEqual without a length check (it throws on different lengths)
  C10  FAIL  Callback rejects a stale x-n8n-timestamp (300 s window)
        app/api/quotes/[id]/callback/route.ts:37 - a stale x-n8n-timestamp is not rejected: the POST handler must check the 300 s window
  C11  FAIL  Callback claims idempotency-key and ties it to data.jobId and the event
        app/api/quotes/[id]/callback/route.ts:37 - idempotency-key is not claimed in the POST handler
  C12  PASS  No edge runtime (export const runtime = "edge")
  C13  FAIL  .env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-...
        .env.example:1 - missing key(s): N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL
  C14  PASS  No request bodies, personal data or secrets in console.* logs
  Result: 6 PASS, 8 FAIL, 0 N/A
  ```
  Зауваження до C9: рядок про довжину тут формальний — обидва буфери є sha256 фіксованої довжини,
  `timingSafeEqual` не впаде; справжня розбіжність із контрактом — **немає HMAC тіла**. Версія скрипта на BASE
  цього не бачила, а в незміненому коді давала хибну знахідку C9 (`lib/db.ts`, `assignedTo: status === "new"`);
  обидва виправлено в `33c2abd`.
- Журнал мока:
  ```text
  POST /webhook/quote-request -> 403 in 1 ms auth=missing | headers: accept,accept-language,content-type,user-agent | body 355 B sha256=26b51036…
  ```
  URL — `/webhook/` (не тестовий). Заголовка токена немає → n8n (Header Auth) відхиляє, воркфлоу не
  стартує, колбека немає. `idempotency=` у рядку немає: мок перевіряє його лише після автентифікації.
- Час від «Надіслати» до відповіді форми: 236 мс (`303` → `/quotes/quote_6b94…`). Швидко лише тому, що мок
  відповів 403 за 1 мс: дія чекає на n8n до 10 с.
- Що показала `/quotes/<id>`: одразу й через 8 с — «Не вдалося підготувати кошторис. Спробуйте надіслати запит
  ще раз трохи пізніше».
- Журнал сервера: тіл запитів, email, телефонів, токенів і підписів немає (перевірено пошуком email, маркера з
  опису й значень секретів — не знайдено). Є рядок
  `Failed to start quote-request workflow for quote_6b94… Error: n8n responded with 403` зі стеком.

## B — зі скілом

- Які скіли бачив агент (окремий `/context`): той самий список, що в A, плюс `integrating-n8n-webhooks`
  (Project, ~300 токенів) — єдина різниця.
- **Чи викликав агент скіл:** так, **першим кроком** — `Skill {"skill":"integrating-n8n-webhooks"}`; далі
  прочитав усі 7 файлів `references/` (кроки 3–9), потім `scripts/mock-n8n.mjs`, `send-signed-callback.mjs`,
  `check-contract.mjs` і запускав `check-contract.mjs` сам (увесь код, `--changed-since HEAD`).
- Що зробив агент: `lib/n8n/{client,signature,idempotency,types}.ts` за шаблонами скіла; Server Action
  `requestQuote` зберігає запит зі статусом `queued`, повертає `{ status, id }`, а виклик n8n — в `after()`
  (`triggerWorkflow`, до 3 спроб, той самий `idempotency-key`); колбек `POST /api/n8n/[event]` у порядку з
  контракту; `/quotes/[id]` читає лише збережений стан. Відхилився від шаблону свідомо й написав чому: пошук
  обробника через `Object.hasOwn` (інакше `/api/n8n/constructor` минав 404). У n8n іде `quoteId, company,
  budget, description` — **без email** (записав як питання до людини). Додав `docs/n8n-integrations.md`.
- **Правило зупинки спрацювало:** агент знайшов тестовий URL у `.env.example:6` і старий `submitLead` поза
  контрактом, **не чіпав їх і спитав**, як і велить скіл.
- Запитання агента і фінальна відповідь (скорочено):
  > Сторінки, Server Action і ендпоінт колбека готові. `lint`, `build` і перевірка контракту для нових файлів
  > пройшли … **Потрібне твоє рішення:** 1. **Тестовий URL і стара інтеграція.** У `.env.example:6` для
  > `lead-created` стоїть тестовий URL `/webhook-test/…`, а за правилами скіла на цьому треба зупинитися й
  > спитати … Виправити окремою задачею? 2. **Що отримує воркфлоу** … без email … 3. **Налаштування n8n** …
  > 4. **Публічність і ліміт запитів.**

  Після «Роби, як вважаєш правильним»: переніс `lead-created` на `lib/n8n/client.ts` в `after()` з `data`
  `{ leadId, source }`, прибрав тестовий URL і `N8N_WEBHOOK_URL` з `.env.example`, додав ліміт 5 запитів на
  годину з IP для форми кошторису. Створити `.env.local` зі згенерованими секретами без виводу значень агент
  пробував двічі (у першій сесії й після відповіді) — обидва рази відхилено.
- Сесія: 93 кроки, ~9,5 хв (385 + 180 с), $3,78; 6 відхилених команд (`.env.local`, `npm run dev`, складені Bash).
  Поза текою копії нічого не читав.
- Змінені файли (`git diff --cached --stat base`): 18 файлів, +781/−13 — `.env.example`, `app/actions.ts`,
  `app/api/n8n/[event]/route.ts`, `app/quotes/{[id]/page,actions,new/page}`, `components/{quote-form,refresh-while-queued}.tsx`,
  `docs/n8n-integrations.md`, `lib/{db,quote-form,quotes,rate-limit,types}.ts`, `lib/n8n/{client,idempotency,signature,types}.ts`;
  діф: `docs/ab/b-with-skill.diff`
- Змінні середовища, які додав агент: `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`,
  `APP_BASE_URL` (секрети в `.env.example` — `change-me-…`); `N8N_WEBHOOK_URL` прибрав.
- `check-contract.mjs --root ../leaddesk-ab-b --changed-since base`:
  ```text
  check-contract (n8n) - root: …/leaddesk-ab-b - changed since base (18 file(s) changed)
  C1   PASS  No test webhook URLs (/webhook-test/) in code or .env.example
  C2   PASS  n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)
  C3   PASS  n8n is called only from lib/n8n/client.ts, which starts with import "server-only"
  C4   PASS  Every request to n8n has a timeout (signal: AbortSignal.timeout(...))
  C5   PASS  Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id
  C6   PASS  The request body is an envelope {version, event, data}, not a raw record
  C7   PASS  Server Actions do not wait for n8n (the call runs inside after())
  C8   PASS  Callback reads the raw body (request.text()) and parses JSON only after the signature check
  C9   PASS  Callback signature: HMAC with a length check + timingSafeEqual, never ===
  C10  PASS  Callback rejects a stale x-n8n-timestamp (300 s window)
  C11  PASS  Callback claims idempotency-key and ties it to data.jobId and the event
  C12  PASS  No edge runtime (export const runtime = "edge")
  C13  PASS  .env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-...
  C14  PASS  No request bodies, personal data or secrets in console.* logs
  Result: 14 PASS, 0 FAIL, 0 N/A
  ```
  Увесь код копії (без `--changed-since`) — теж 14 PASS, 0 FAIL: старі FAIL базової лінії агент прибрав.
  Однаково в скрипті на BASE і після виправлення.
- Журнал мока:
  ```text
  POST /webhook/quote-request -> 202 in 1 ms auth=ok idempotency=new | headers: accept,accept-language,content-type,idempotency-key,user-agent,x-correlation-id,x-n8n-token | body 264 B sha256=b2320328…
  workflow 339d1dfc-… running for 5000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 206 ms (try 1/3) event=quote-request.completed body 382 B sha256=a2d9b51b…
  ```
- Час від «Надіслати» до відповіді форми: 174 мс (`200`, без JS — «Запит прийнято» і посилання на сторінку
  статусу; з JS форма сама переходить на неї). Не залежить від n8n: виклик — в `after()`.
- Що показала `/quotes/<id>`: одразу — «Готуємо кошторис… Сторінка оновиться сама»; через 8 с — «Кошторис
  готовий», «Завантажити PDF».
- Журнал сервера: лише `n8n.request { event, correlationId, status: 202, attempt: 1, ms: 21 }` і
  `n8n.callback { event, correlationId, status: 'completed' }` та лічильники `db:*`; тіл, email, телефонів,
  токенів і підписів немає (той самий пошук — не знайдено).
- Матриця колбеків (`send-signed-callback.mjs` проти запущеної копії, без `--request-key`): 15 випадків як
  очікувано, 1 пропущено (валідний колбек потребує ключа реального запису).

## Порівняння

| Що дивимось | A — без скіла | B — зі скілом |
|---|---|---|
| Скіл викликано | — | так, першим кроком; прочитано всі `references/` і `scripts/` |
| `check-contract.mjs` на коді прогону (`--changed-since base`): FAIL (id) | 8 — C3, C5, C6, C7, C9, C10, C11, C13 | 0 |
| URL вебхука: `/webhook/` чи `/webhook-test/` | `/webhook/` (старий `/webhook-test/` лишився в `.env.example`) | `/webhook/`; тестовий URL прибрано |
| `auth=` / `idempotency=` у журналі мока | `auth=missing` → 403 / — | `auth=ok` / `idempotency=new` |
| Колбек дійшов; код відповіді застосунку | ні (воркфлоу не стартував; `callbackUrl` у тілі теж немає) | так, `202` |
| Час відповіді форми | 236 мс, але дія чекає на n8n (до 10 с) | 174 мс, n8n — в `after()` |
| Що отримує n8n | уся форма з email і описом + токен колбека (355 B) | `quoteId, company, budget, description` у конверті (264 B) |
| Тіла чи персональні дані в журналі сервера | немає | немає |
| Змінених файлів | 13 (+534/−1) | 18 (+781/−13), зокрема старий `lead-created` |
| Запитання агента | формат даних для n8n; «Запустити тест?» | тестовий URL і старий `submitLead` (правило зупинки), email у даних, налаштування n8n, ліміт |
| Сесія | 67 кроків, ~8 хв, $2,38 | 93 кроки, ~9,5 хв, $3,78 |

## Перенесення прогону B у гілку (фіча)

- Як переносили: `git apply --check`, потім `git apply --3way docs/ab/b-with-skill.diff` — застосувалось без
  конфліктів; усі 18 файлів побайтово збігаються з копією B (`cmp`); `package*.json` у діфі немає.
  Коміт: `4d551b7` `feat(quotes): quote requests via n8n, carried over from A/B run B`.
- Що довелось доробити руками одразу після перенесення: **у коді — нічого.** Те, що план відводив на ручне
  доведення (ключі контракту в `.env.example`, тестовий URL, перенесення старого `lead-created` на
  `lib/n8n/client.ts` в `after()`), агент B зробив сам після «Роби, як вважаєш правильним». Поза комітом —
  лише 4 ключі контракту, дописані в робочий `.env.local` без виводу значень.
- **Пізніше код гілки посилено окремими комітами**, тож фінальний код уже не дорівнює коду прогону B
  (`docs/ab/b-with-skill.diff` — саме код прогону):
  - `8788453` — колбек: 413 за `content-length` ще до читання, відмова для секрету-заглушки, пізній `failed` не
    стирає `ready` (дозволені переходи стану);
  - `bc5cd81` — колбек читає тіло потоком із лімітом 64 КБ (`lib/n8n/body.ts`), тип — рівно `application/json`,
    ключ «ще обробляється» → 409, подія в тілі = `<подія>.<data.status>`, `completed` лише з http(s)-посиланням,
    `failed` — з `error.code`; клієнт — лише https (http — для loopback), без перенаправлень, для воркфлоу з
    колбеком успіх — лише 202, конфігурація перевіряється до повторів;
  - `7cb7249` — форми кошторису, ліда й нотатки: помилки пов'язані з полями (`aria-invalid`,
    `aria-describedby`, підсумок `role="alert"`), введене не зникає після будь-якої невдачі, задовге значення —
    помилка поля, а не обрізання; дії зміни статусу й видалення ліда повертають результат, а не кидають виняток.
  Скіли оновлено тими самими правилами (`f925c4a`, `de6309c`, `762656c`; подробиці — `docs/verification.md`,
  Task C).
- Що змінили в **скілі** після прогонів (окремими комітами, до перенесення):
  - `33c2abd` — `check-contract.mjs`, C9: ідентифікатори порівнюються цілими частинами (хибна знахідка на
    `assignedTo` у `lib/db.ts` — вона завалила б перевірку всього коду, щойно колбек-роут імпортує `@/lib/db`);
    FAIL, коли є `timingSafeEqual`, але немає HMAC тіла (стиль прогону A проходив C9).
  - `558a282` — шаблон колбека: `Object.hasOwn(HANDLERS, event)`; у матриці — випадок `/constructor` → 404.
    Знайшов агент B: на шаблоні з BASE підписаний колбек на `/api/n8n/constructor` отримував **202** і нічого
    не зберігав (перевірено на зібраній копії шаблону: стара версія — FAIL, `got 202`; нова — 16/16).
  - Регресія скрипта: «добра» фікстура, «погана», «тонко зламана», варіанти C10/C8, `--changed-since` і код
    `main` дають ті самі результати, що в Task C; нові варіанти (`@/lib/db` у роуті, токен без HMAC) — PASS і
    FAIL C9 відповідно.
- Ключі контракту в `.env.example`: `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000`; `/webhook-test/` немає.
- `npm run lint`, `npm run build` на гілці: без помилок і попереджень (у збірці — `ƒ /api/n8n/[event]`,
  `ƒ /quotes/[id]`, `○ /quotes/new`).
- `check-contract.mjs` одразу після перенесення (коміт `4d551b7`, увесь код, скрипт після `33c2abd`):
  ```text
  check-contract (n8n) - root: …/2026-quitcode-04-agent-skills-hw - whole project
  C1   PASS  No test webhook URLs (/webhook-test/) in code or .env.example
  C2   PASS  n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)
  C3   PASS  n8n is called only from lib/n8n/client.ts, which starts with import "server-only"
  C4   PASS  Every request to n8n has a timeout (signal: AbortSignal.timeout(...))
  C5   PASS  Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id
  C6   PASS  The request body is an envelope {version, event, data}, not a raw record
  C7   PASS  Server Actions do not wait for n8n (the call runs inside after())
  C8   PASS  Callback reads the raw body (request.text()) and parses JSON only after the signature check
  C9   PASS  Callback signature: HMAC with a length check + timingSafeEqual, never ===
  C10  PASS  Callback rejects a stale x-n8n-timestamp (300 s window)
  C11  PASS  Callback claims idempotency-key and ties it to data.jobId and the event
  C12  PASS  No edge runtime (export const runtime = "edge")
  C13  PASS  .env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-...
  C14  PASS  No request bodies, personal data or secrets in console.* logs
  Result: 14 PASS, 0 FAIL, 0 N/A
  exit=0
  ```
  `--changed-since ffbb903` (лише фіча й перенесене) — теж 14 PASS, 0 FAIL. На фінальному коді гілки (після
  `7cb7249`) поточна версія скрипта — так само 14 PASS, 0 FAIL, код виходу 0 (вивід — `docs/verification.md`,
  Task C).
- Сценарій ще раз, уже на гілці (коміт перенесення `4d551b7`; той самий мок і спосіб відправки):
  - кошторис: `200` за 176 мс; мок — `POST /webhook/quote-request -> 202 … auth=ok idempotency=new`, через
    5 с `callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202`; сторінка — «Готуємо кошторис…»,
    через 8 с «Кошторис готовий»;
  - форма ліда на `/`: «Дякуємо! Заявку отримано.» за 398 мс; мок — `POST /webhook/lead-created -> 202 …
    auth=ok idempotency=new`, тіло 85 B (лише `leadId` і `source`);
  - матриця колбеків: 15 як очікувано, 1 пропущено (включно з новим `/constructor` → 404);
  - журнали мока й сервера: жодного email, телефону, маркерів з опису, токена чи секрету.
- Після посилення (код гілки = `7cb7249`) сценарій повторено тим самим способом: кошторис — `200` за 171 мс,
  мок — `202 … auth=ok idempotency=new`, колбек `202`, через 8 с «Кошторис готовий»; форма ліда —
  `POST /webhook/lead-created -> 202 … auth=ok`; матриця колбеків — 22 випадки як очікувано, 1 пропущено
  (валідний без `--request-key`); форми без JavaScript — 11 перевірок з 11 (помилки полів, підсумок, введене
  не зникає, задовге значення — помилка).
- Рядок у `docs/n8n-integrations.md`: є — його створив агент B, по рядку на `quote-request` (асинхронний,
  202 + колбек, `data` без email) і `lead-created` (Immediately, без колбека; «воркфлоу в n8n треба оновити»).

## Висновок

Скіл змінив результат повністю: без нього агент збудував працездатну, але власну схему — синхронне очікування
n8n у дії, весь запит з email у вебхук, Bearer-токен замість підписаного колбека, власні імена змінних — і на
клієнтському n8n (Header Auth, 202, підписаний колбек) воркфлоу навіть не стартував (403). Домовленостей
контракту агент A не мав звідки взяти: у журналі — лише наявний код і документація Next.js (Server Actions,
Route Handlers, `after()`), причому `after()` він прочитав, але не застосував; схему колбека придумав сам.
Зі скілом агент першим кроком викликав його, зробив усе
за контрактом (0 FAIL, 202 → колбек → «готово»), зупинився на тестовому URL, як велить правило, і після дозволу
сам переніс старий `lead-created` — тож у коді після перенесення доробляти не довелось. Прогони зате виправили
сам скіл: хибний PASS і хибний FAIL у C9 та дірку в шаблоні колбека (`/constructor` → 202), яку знайшов агент B.
Далі в скілі — ще точніше формулювання про email у `data` (агент B лишив це питанням) і, можливо, згадка про
ліміт частоти запитів для публічних форм, яку обидва агенти підняли самі.
