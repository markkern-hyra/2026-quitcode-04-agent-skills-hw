# Перевірка (Task A–C)

> Сюди — лише те, що справді сталося: цитати, числа, імена файлів, SHA комітів.
> Прогони A/B і фіча «запит на кошторис» — в окремому звіті `docs/ab-validation.md` (Task D).

- **Інструмент і версія, модель:** основна сесія — Claude Code 2.1.281 (розширення VS Code); свіжі
  сесії для перевірок — headless `claude -p` з CLI розширення, 2.1.283 · модель Opus 5.5
  (`claude-opus-5-5`), effort xhigh
- **ОС і термінал, Node:** macOS 26.6.2 · zsh · Node 22.20.0 · npm 10.9.3

## Скіли видно у свіжій сесії

- Як перевіряли: окремий запуск `/context` у свіжій headless-сесії з кореня репозиторію, розділ Skills:
  ```bash
  claude -p "/context" --model claude-opus-5-5 --effort xhigh \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}'
  ```

| Skill | Звідки (Project / Personal / вбудований) | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | видно одразу після коміту `b8f6866` (27.09.2026) |
| `building-client-form` | Project | у записі `init` обох сесій перевірки спрацювання (Task B), після коміту `f0d8c3b` |
| `integrating-n8n-webhooks` | | |

- Особисті скіли, які теж видно, і чи можуть вони вплинути на перевірки:
  - `no-mistakes` (User, `~/.claude/skills`) — конвеєр перевірки змін (рев'ю, тести, push, PR), не про
    форми й n8n;
  - скіли з синхронізації claude.ai — `docs`, `docx`, `import-memory`, `morning`, `pdf`, `pptx`,
    `skill-creator`, `sow-generator`, `theme-factory`, `web-artifacts-builder`, `xlsx` — про документи;
  - вбудовані скіли Claude Code (`code-review`, `security-review`, `claude-api`, `run` та ін.).

  Вони однакові для всіх перевірок і не стосуються форм чи n8n. `find-skills`, який поставив
  skills CLI, видалили ще до перевірок (див. `docs/skill-review.md`, розділ 6).
- **Ізоляція від конекторів claude.ai.** Контрольний `/context` без прапорців MCP показав у свіжій сесії
  MCP-інструменти (Claude Docs і ще ~1,4 тис. токенів відкладених MCP-інструментів; у нашій основній
  сесії серед конекторів — n8n, Zoho CRM, Make, Figma). З `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`
  MCP-інструментів немає: у записі `init` справжньої сесії (рев'ю Task A) — `mcp_servers: []` і 0 MCP-інструментів.
  Тому всі свіжі сесії (Task A–E) запускаємо з цими прапорцями: n8n-конектор інакше підказував би агенту
  про n8n (і міг би змінювати справжній акаунт n8n).
- Скіли плагіна `airtable` (8 шт., `airtable:*`) прапорці MCP **не** прибирають: в ізольованому
  `/context` їх не було, але в записі `init` сесії рев'ю вони є. Вони про Airtable і не стосуються форм
  чи n8n. Для A/B (Task D) повний список скілів беремо з запису `init` кожного прогону й звіряємо.

## Task A — виправлення за скілом Vercel

Шість виправлень — кожне окремим комітом `fix(<rule-id>)`. Число до/після обов'язкове для одного
(`async-parallel`); для решти числа зняли тим самим скриптом як додатковий доказ.

### Рев'ю у свіжій сесії

- Запит (walkthrough, Task A, крок 5.1), свіжа headless-сесія з інструментами лише Skill, Read, Grep, Glob
  (Edit, Write і Bash заборонені):
  > Зроби рев'ю app/, components/, lib/ за скілом vercel-react-best-practices. Для кожної проблеми — рядок
  > таблиці: файл:рядок | id правила | що не так | виправлення для Next.js 16. Файли не змінюй.
- Агент першим кроком викликав `Skill` → `vercel-react-best-practices`, прочитав код і файли правил, звірив
  поради з `node_modules/next/dist/docs/`; 62 кроки, 280 с, файлів не змінював (`git status` без змін).
- 17 знахідок (id правила → що з ними зробили):

  | Файл:рядок (на `main`) | id правила | Рішення |
  |---|---|---|
  | `app/actions.ts:68`, `:74` | `server-auth-actions` | виправлено — `881c13b` |
  | `app/dashboard/page.tsx:16-18` | `async-parallel` | виправлено — `c64a899` (з числами) |
  | `app/dashboard/page.tsx:17` | `async-suspense-boundaries` | не застосовано — кандидат (див. нижче) |
  | `components/leads-toolbar.tsx:4` | `bundle-conditional` | виправлено — `a6aca9b` |
  | `components/leads-toolbar.tsx:6` | `bundle-dynamic-imports` | виправлено — `186175d` |
  | `components/lead-search.tsx:5` | `bundle-barrel-imports` (`lodash`) | не застосовано — див. нижче |
  | `app/dashboard/page.tsx:32`, `components/leads-table.tsx:12` | `server-serialization` | виправлено — `97c8236` |
  | `lib/data.ts:7`, `:18` | `server-cache-react` (2 рядки) | виправлено — `122b909` |
  | `app/actions.ts:53-63` | `server-after-nonblocking` | свідомо відкладено до Task D — див. нижче |
  | `components/lead-search.tsx:20-24` | `client-swr-dedup` (+ `server-dedup-props`) | не застосовано |
  | `components/lead-search.tsx:18`, `components/lead-actions.tsx:11` | `rerender-derived-state-no-effect` (2 рядки) | не застосовано |
  | `components/leads-table.tsx:56-58` | `bundle-preload` | не застосовано |
  | `components/leads-table.tsx:24`, `components/leads-toolbar.tsx:72` | `rerender-functional-setstate` | не застосовано |
  | `components/leads-table.tsx:17-20` | `js-tosorted-immutable` | не застосовано |
  | `lib/db.ts:335-338` | `js-combine-iterations` | не застосовано — це заглушка БД |

### Виправлення й заміри

**Як міряли:** продакшн-збірка (`npm run build && npm start`) після кожного коміту; cookie
`leaddesk_session=demo-u_olena`; для `/dashboard`: прогрів + 3 прогони
`curl -w "TTFB %{time_starttransfer}s, total %{time_total}s"`, розмір HTML (`curl … | wc -c`) і RSC
(`-H "RSC: 1"`), входження полів ліда в HTML (`grep -o <поле> | wc -l`), виклики `db:<запит>` за один запит
(приріст лічильників у журналі `npm start`), початковий JS — сума нестиснених файлів
`<script src="/_next/static/…js">` з HTML. «Було» — стан перед цим виправленням (виправлення накопичуються в
порядку комітів), для першого — код `main`.

| Правило (id) | Коміт | Файли | Що змінилось | Було | Стало | Як міряли |
|---|---|---|---|---|---|---|
| `async-parallel` | `c64a899` | `app/dashboard/page.tsx` | `getLeads`, `getLeadStats`, `getSourceBreakdown` через `Promise.all` замість трьох послідовних `await` | TTFB 2,229 / 2,240 / 2,237 с (`main`) | TTFB 1,431 / 1,433 / 1,428 с (−0,8 с, −36 %) | curl, 3 прогони після прогріву |
| `server-cache-react` | `122b909` | `lib/data.ts`, 4 місця виклику | `getCurrentUser` у `cache()`; `getWorkspace` приймає рядок `slug` замість inline-об'єкта | `db:getUserBySession` ×3, `db:getWorkspace` ×3 за запит | ×1 і ×1; TTFB без змін (≈1,43 с) | лічильники `db:*` у журналі сервера |
| `server-serialization` | `97c8236` | `app/dashboard/page.tsx`, `components/leads-table.tsx` | у `LeadsTable` — лише `id, fullName, company, status, createdAt` (тип `LeadRow`) | HTML 424 592 Б, RSC 315 197 Б; `internalNotes`, `ipAddress`, `rawPayload` у HTML — по 172 | HTML 111 377 Б (−74 %), RSC 31 257 Б (−90 %); 0 входжень | `wc -c`, `grep -o` |
| `bundle-conditional` | `a6aca9b` | `components/leads-toolbar.tsx` | `exceljs` — `await import("exceljs")` у `handleExport` | початковий JS 1 871 692 Б | 940 993 Б (−50 %); `exceljs` — окремий чанк 930 904 Б | сума скриптів з HTML |
| `bundle-dynamic-imports` | `186175d` | `components/leads-toolbar.tsx` | `SourcesChart` (recharts) через `next/dynamic(…, { ssr: false })` у Client Component | 940 993 Б | 587 204 Б (−38 %; від `main` −69 %) | сума скриптів з HTML |
| `server-auth-actions` | `881c13b` | `app/actions.ts` | у `updateLeadStatus` і `deleteLead` — сесія, лід з воркспейсу користувача й валідація статусу всередині дії | прямий POST дії (`Next-Action`) від Марти (воркспейс brightline) на лід Studio Nova: HTTP 200, статус «Кваліфікований» → «Втрачений» | HTTP 500 `Lead not found`, статус не змінився; `deleteLead` так само відхилено; Олена свій лід змінює (200) | curl з `Next-Action` і cookie двох користувачів |

- Чому для обов'язкового заміру — `async-parallel`: скарга клієнта саме «дашборд відкривається понад 2
  секунди», а ця затримка — водоспад 400 + 1200 + 400 мс послідовних запитів; ефект видно в TTFB без браузера.
- Решта виправлень — як переконались, що не зламали:
  - `server-cache-react`: сторінка ліда — 200 і по одному виклику `getUserBySession`/`getWorkspace`/`getLead`;
    лід іншого воркспейсу (`lead_0007` для Олени) — як і раніше, 404.
  - `server-serialization`: таблиця рендерить ті самі 172 рядки; сортування й поля перевірив TypeScript у збірці.
  - `bundle-conditional`: експорт у браузері перевірили руками — файл `leads-<дата>.xlsx` завантажився.
  - `bundle-dynamic-imports`: графік у браузері перевірили руками — спершу заглушка висотою 64 px, потім графік;
    «Сховати графік» працює.
  - `server-auth-actions`: атака до/після (у таблиці), плюс некоректний статус `"bogus"` від Олени — HTTP 500
    `Unknown lead status`, у базу не записано; зміна статусу власного ліда працює.
- Поради скіла, звірені з Next.js 16 і **не** застосовані або змінені:
  - `server-after-nonblocking` для `submitLead` (виклик n8n і `logAudit` блокують форму): для Next.js 16 порада
    правильна (`after.md`), але в Task A її свідомо не застосовували. Виклик n8n переробляємо в Task D за
    контрактом n8n; зміна тут внесла б частину контракту в BASE, і прогін A отримав би її «задарма».
  - `bundle-barrel-imports` для `recharts` — зайва: Next.js 16 оптимізує `recharts` сам
    (`optimizePackageImports.md`), тож графік прибрали з початкового JS через `bundle-dynamic-imports`.
    Для `lodash` (CJS) — у списку за замовчуванням його немає; рев'ю радить замінити debounce на
    `useDeferredValue` і прибрати залежність, але це вже переписування пошуку — лишили кандидатом.
  - `bundle-dynamic-imports`: приклад скіла зі `ssr: false` не каже, що це лише для Client Components; у
    Server Component це зламало б збірку (`lazy-loading.md:94–95`). Застосували в `leads-toolbar.tsx`
    (`"use client"`).
  - `async-suspense-boundaries`: стрімінг статистики скоротив би TTFB ще сильніше, але до обсягу домашки не
    ввійшов — кандидат на наступну ітерацію.
- Якщо виміряне виправлення не змінило чисел — чому: `async-parallel` змінило (−0,8 с). `server-cache-react`
  TTFB не змінив, і так має бути: layout, шапка й сторінка рендеряться одночасно, тож дубльовані запити йшли
  паралельно; виграш — у навантаженні на БД (3 → 1 запит). Решта TTFB ≈1,4 с — найповільніший запит
  `getLeadStats` (1,2 с) плюс користувач і воркспейс (0,2 с); прибрати її можна стрімінгом, а не паралельністю.
- `npm run lint`, `npm run build` після кожного з шести виправлень — без помилок і попереджень.

## Task B — `building-client-form`

- Запит у свіжій сесії (скіл не названо), обидві спроби — той самий текст:
  > На сторінці ліда в дашборді (/dashboard/leads/[id]) додай форму «Додати нотатку»: одне текстове поле до
  > 500 символів; нотатка дописується до внутрішніх нотаток ліда.
- Сесії: headless `claude -p`, ізоляція як вище, `--permission-mode acceptEdits`, дозволено лише Skill, Read,
  Grep, Glob, `npm run lint` і `npm run build`; журнал — stream-json.
- Чи спрацював скіл і як це видно: **так, в обох спробах, першим же кроком** — у журналі сесії перший виклик
  інструмента: `Skill {"skill":"building-client-form"}`. У записі `init` серед проєктних скілів —
  `building-client-form` і `vercel-react-best-practices`.
- `description` не змінювали: скіл спрацював з першої спроби. Друга спроба знадобилась через **тіло** скіла —
  див. нижче.

**Спроба 1** (скіл — коміт `f0d8c3b`; 36 кроків, 151 с):

- Що зроблено: `addLeadNote` в `app/actions.ts` (сесія й належність ліда — першим кроком, серверна валідація,
  аудит в `after()`, повертає лише `{ status }`), нові `lib/lead-note-form.ts` (парсер: trim, порожнє, ≤ 500
  символів з урахуванням CRLF) і `components/lead-note-form.tsx` (`useActionState`, `label`, `aria-invalid`,
  `aria-describedby`, підсумок у `role="alert"`, `defaultValue` з `values`, `role="status"` для успіху),
  `db.appendLeadNote` у `lib/db.ts`, блок нотаток на `app/dashboard/leads/[id]/page.tsx`.
- Verify: lint і build — без помилок. З JavaScript (перевірка в браузері): порожня відправка показує помилки,
  нотатка додається. **Без JavaScript — провал:** в обох випадках (порожня й звичайна нотатка) сторінка
  «крутиться» й не відповідає. Так само в `curl` з тими самими полями форми; `next dev` пише
  `POST /dashboard/leads/lead_0001 200 in 10.0s (application-code: 10.0s)` — рендер після дії не завершується,
  хоча дія виконалась і нотатку записано.
- Причина: агент прив'язав id ліда як `useActionState(addLeadNote.bind(null, leadId), …)` у Client Component.
  Експеримент: той самий код, але id — прихованим полем `leadId`, а дія читає його з `formData` → відправка без
  JavaScript відповідає за ~0,5 с (порожня — з помилками, звичайна — з нотаткою). Оригінальна форма заявки
  (без `.bind`) без JavaScript працює.
- Покращення скіла (коміт `38d48b1`): крок 3 — id запису лише прихованим полем з перевіркою в дії, без `.bind`
  у Client Component; у каркасі — `recordId` з `formData` і `<input type="hidden">`; у чеклісті — пункт 10; у
  Verify — «сторінка перезавантажується, а не крутиться».

**Спроба 2** (новий запуск, скіл — коміт `38d48b1`; 35 кроків, 160 с):

- Що зроблено: ті самі файли, але id ліда — прихованим полем `<input type="hidden" name="leadId">`, `.bind`
  немає; дія спершу перевіряє сесію, потім належність ліда з прихованого поля, потім текст.
- Пункти Verify — результат (продакшн-збірка; форма відправлялась без JavaScript — POST `multipart/form-data`
  з тими самими прихованими полями, що рендерить сервер):

  | Пункт Verify | Результат |
  |---|---|
  | `npm run lint`, `npm run build` | без помилок |
  | Порожня відправка без JavaScript | HTTP 200 за 0,43 с; підсумок `role="alert"`, у поля `aria-invalid="true"` |
  | 501 символ без JavaScript | помилка довжини, введений текст на місці (`defaultValue`) |
  | Звичайна нотатка без JavaScript | HTTP 200 за 0,50 с, нотатка на сторінці |
  | Дія без сесії | HTTP 307 → `/login` |
  | Чужий запис: Марта (brightline) шле нотатку на лід Studio Nova | відхилено, нотатки в ліді немає |
  | Підміна прихованого `leadId` на лід іншого воркспейсу (`lead_0007`) | нічого не записано |
  | Журнал сервера після відправок | 0 входжень тексту нотаток; лише `db:appendLeadNote` і `db:insertAuditEntry` (аудит — з `after()`) |

- Код спроби 2 пройшов Verify. У гілку його додамо **після Task D**: так BASE для A/B не містить прикладу
  `after()` в `app/actions.ts`, який підказав би прогону A частину контракту n8n («виклик n8n — в `after()`»).
  До того часу зміни збережено локально (`git stash`).

## Task C — `integrating-n8n-webhooks`

Тут скіл лише пакують. Застосовує його агент у прогоні **B** (Task D) — доказ спрацювання, журнал
мока й час відповіді форми — у `docs/ab-validation.md`.

- Що лишили в `SKILL.md`, а що винесли в `references/` (і чому):
  - `SKILL.md` (127 рядків, `description` — 879 символів) — те, що потрібно щоразу: коли застосовувати й коли
    ні, контракт коротко (4 змінні, запит і заголовки, конверт, таймаут і повтори, режим 202 + колбек, порядок
    перевірок колбека одним абзацом), 8 кроків «Як робимо» з id правил Vercel (`server-auth-actions`,
    `server-after-nonblocking`), чекліст з 10 пунктів, правила зупинки, Verify і мапа файлів.
  - `references/` — деталі й «чому», які потрібні лише на конкретному кроці: `contract.md` (змінні, запит,
    конверт, повтори, хто викликає), `callback.md` (колбек крок за кроком і чому саме такий порядок),
    `response-modes.md` (режими Webhook, 100 с / 524, тестовий і production URL), `code-templates.md`
    (шаблони `lib/n8n/*`, колбек-роуту й Server Action), `logging-and-limits.md`, `n8n-setup.md` (вузли n8n
    словами, без JSON воркфлоу), `pitfalls.md` (розбіжності документації n8n і чужих скілів, межі перевірок).
  - `scripts/`: `check-contract.mjs` (статичні перевірки C1–C14), `send-signed-callback.mjs` (матриця
    колбеків проти запущеного застосунку, 14 випадків + 1 з `--request-key`), `mock-n8n.mjs` (копія
    `tools/mock-n8n.mjs`, байт у байт — `cmp`). Лише вбудовані модулі Node; секрети — лише з env, значення
    не друкуються.
- Правила зупинки — перелік (зупинитись і спитати людину; без винятків «якщо задача цього потребує»):
  1. тестовий URL `/webhook-test/…` у задачі, коді чи `.env*`;
  2. секрет чи токен довелося б передати в Client Component, query string, журнал чи `NEXT_PUBLIC_*`;
  3. синхронне очікування воркфлоу, що може тривати до 100 с чи довше (або невідомо скільки);
  4. бажання пропустити чи послабити перевірку підпису, вікна часу чи ідемпотентності колбека;
  5. n8n потрібні дані понад мінімум (весь рядок з бази, IP, внутрішні нотатки, персональні дані);
  6. зміна контракту: імена заголовків, схема підпису, коди відповідей, імена змінних;
  7. «потрібна» нова залежність чи `runtime = "edge"`;
  8. немає події чи шляху вебхука — не вигадувати назву воркфлоу.
- SHA коміту зі скілом (BASE для Task D): `ffbb903` (`ffbb903bd64fbd2b3dbd75b55e32293b46abb67c`) —
  `skills: add integrating-n8n-webhooks (contract, references, scripts)`
- Що скіл змінив у собі після прогонів (коміти й чому): <…>

**Як перевірили, що скрипти ловлять порушення, а шаблони — робочі** (фікстури — копії застосунку в
тимчасовій теці, після перевірок видалені):

| Що перевіряли | Результат |
|---|---|
| «Добра» фікстура: код HEAD + файли з `code-templates.md` дослівно (`.env.example`, `lib/n8n/*`, колбек-роут, Server Action) + заглушка `lib/quotes.ts`; `submitLead` переведено на `triggerWorkflow` в `after()` | `check-contract` — 14 PASS, код 0; `npm run lint` і `npm run build` без помилок (`ƒ /api/n8n/[event]` у збірці) |
| Матриця колбеків проти цієї збірки (`next start`, секрет згенеровано для фікстури) | 14/14 як очікувано; з `--request-key` тестового запису — 15/15, включно з 202 → 200 `{"duplicate":true}`. У журналі сервера — лише подія, `correlationId` і статус; секрету, ключа, `sha256=`, тіла немає |
| «Погана» фікстура: два колбек-роути — `JSON.parse` до перевірки й `!==`; `request.json()`, `===`, `runtime = "edge"`, тіло в `console.log`; без часу й ідемпотентності | C8, C9, C10, C11, C12, C14 — FAIL (13 рядків `файл:рядок`), код 1; C1–C7 і C13 — PASS (цей код не чіпали) |
| «Тонко зламаний» колбек: шаблон без перевірки довжини перед `timingSafeEqual`, без вікна часу, без звільнення ключа після 400 | Матриця — 4 FAIL: час ±10 хв → 400 замість 401 (×2); підпис іншої довжини → 500 (`RangeError` у журналі); той самий поганий запит удруге → 200 замість 400. `check-contract` — C9 і C10 FAIL (C10 — після виправлення нижче) |
| `--changed-since` у тимчасовому git-репозиторії: база — код HEAD (старі FAIL у `app/actions.ts` і `.env.example`), потім по одній зміні кожного виду | Звітує лише нове: C2 `.env.example:7` (закомічено після бази), C14 `lib/data.ts:39` (staged), C8–C11 (новий untracked роут), C13 (відсутні ключі — на весь змінений `.env.example`). Старі C1, C3–C7 — «finding(s) in unchanged code ignored», хоча unstaged-правка зсунула їх на рядок. `--changed-since HEAD` прибирає закомічену зміну. Поганий ref, `--root` чи опція → код 2; `--help` → 0 |

- Що змінили в `check-contract.mjs` за цими перевірками (до коміту скіла):
  - **C10, хибний PASS.** Досить було, щоб `x-n8n-timestamp` і `300` траплялись у роуті чи його імпортах —
    «тонко зламаний» роут, що не викликає `isFreshTimestamp`, проходив. Тепер вікно мусить бути в POST-обробнику:
    напряму, через константу (`5 * 60`) або через функцію, яка до нього доходить на будь-якій глибині.
  - **C8, хибний FAIL.** Перевірку підпису впізнавало лише за назвою (`verifySignature`, `isValidSignature`…),
    тож правильний код із `verifyCallback()` отримував «JSON is parsed before the signature is verified». Тепер
    перевірка — будь-яка функція, що доходить до `timingSafeEqual`.
  - Перевірили варіантами шаблону: вікно прямо в обробнику, константа `5 * 60`, вкладений `verifyCallback` →
    0 FAIL; `parseCallback` до `verifyCallback` → C8 FAIL; «добра» й «погана» фікстури та `--changed-since` —
    ті самі результати, що вище.

**`check-contract.mjs` на коді `main`** (`git archive main` у `../leaddesk-main`; абсолютний шлях у першому
рядку скорочено):

```
$ node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs --root ../leaddesk-main; echo "exit=$?"
check-contract (n8n) - root: …/leaddesk-main - whole project
C1   FAIL  No test webhook URLs (/webhook-test/) in code or .env.example
      .env.example:6 - test webhook URL (/webhook-test/) in .env.example
C2   PASS  n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)
C3   FAIL  n8n is called only from lib/n8n/client.ts, which starts with import "server-only"
      app/actions.ts:54 - request to n8n outside lib/n8n/client.ts
C4   FAIL  Every request to n8n has a timeout (signal: AbortSignal.timeout(...))
      app/actions.ts:54 - no timeout: add signal: AbortSignal.timeout(10_000)
C5   FAIL  Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id
      app/actions.ts:54 - missing header(s): x-n8n-token, idempotency-key, x-correlation-id
C6   FAIL  The request body is an envelope {version, event, data}, not a raw record
      app/actions.ts:54 - the body is not an envelope { version: 1, event, data }
C7   FAIL  Server Actions do not wait for n8n (the call runs inside after())
      app/actions.ts:54 - the Server Action waits for n8n: move the call into after()
C8   N/A   Callback reads the raw body (request.text()) and parses JSON only after the signature check (no n8n callback route found)
C9   N/A   Callback signature: HMAC with a length check + timingSafeEqual, never === (no n8n callback route found)
C10  N/A   Callback rejects a stale x-n8n-timestamp (300 s window) (no n8n callback route found)
C11  N/A   Callback claims idempotency-key and ties it to data.jobId and the event (no n8n callback route found)
C12  PASS  No edge runtime (export const runtime = "edge")
C13  FAIL  .env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-...
      .env.example - missing key(s): N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL
C14  PASS  No request bodies, personal data or secrets in console.* logs
Result: 3 PASS, 7 FAIL, 4 N/A
exit=1
```

**`check-contract.mjs` на «поганій» фікстурі** (два колбек-роути з порушеннями; решта коду — як у «добрій»):

```
C1   PASS  No test webhook URLs (/webhook-test/) in code or .env.example
C2   PASS  n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)
C3   PASS  n8n is called only from lib/n8n/client.ts, which starts with import "server-only"
C4   PASS  Every request to n8n has a timeout (signal: AbortSignal.timeout(...))
C5   PASS  Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id
C6   PASS  The request body is an envelope {version, event, data}, not a raw record
C7   PASS  Server Actions do not wait for n8n (the call runs inside after())
C8   FAIL  Callback reads the raw body (request.text()) and parses JSON only after the signature check
      app/api/n8n/[event]/route.ts:8 - JSON is parsed before the signature is verified
      app/api/webhooks/n8n/route.ts:8 - request.json() re-serializes the body: read request.text() and verify the signature first
      app/api/webhooks/n8n/route.ts:7 - the body is not read as raw text (await request.text())
C9   FAIL  Callback signature: HMAC with a length check + timingSafeEqual, never ===
      app/api/n8n/[event]/route.ts:10 - the signature is compared without timingSafeEqual
      app/api/n8n/[event]/route.ts:11 - the signature is compared with ===/!==: use timingSafeEqual
      app/api/webhooks/n8n/route.ts:10 - the signature is compared without timingSafeEqual
      app/api/webhooks/n8n/route.ts:11 - the signature is compared with ===/!==: use timingSafeEqual
C10  FAIL  Callback rejects a stale x-n8n-timestamp (300 s window)
      app/api/n8n/[event]/route.ts:6 - a stale x-n8n-timestamp is not rejected: the POST handler must check the 300 s window
      app/api/webhooks/n8n/route.ts:7 - a stale x-n8n-timestamp is not rejected: the POST handler must check the 300 s window
C11  FAIL  Callback claims idempotency-key and ties it to data.jobId and the event
      app/api/n8n/[event]/route.ts:6 - idempotency-key is not claimed or not checked against data.jobId and the event
      app/api/webhooks/n8n/route.ts:7 - idempotency-key is not claimed or not checked against data.jobId and the event
C12  FAIL  No edge runtime (export const runtime = "edge")
      app/api/webhooks/n8n/route.ts:5 - runtime = "edge": the contract needs node:crypto (Node.js runtime)
C13  PASS  .env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-...
C14  FAIL  No request bodies, personal data or secrets in console.* logs
      app/api/webhooks/n8n/route.ts:9 - logs "body": log ids, events and codes, not bodies, personal data or secrets
Result: 8 PASS, 6 FAIL, 0 N/A
exit=1
```

**`check-contract.mjs` на фінальному коді** (після перенесення прогону B — 0 FAIL):

```
<вивід>
```
