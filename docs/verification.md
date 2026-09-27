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

- Що лишили в `SKILL.md`, а що винесли в `references/` (і чому): <…>
- Правила зупинки — перелік: <…>
- SHA коміту зі скілом (BASE для Task D): <…>
- Що скіл змінив у собі після прогонів (коміти й чому): <…>

**`check-contract.mjs` на коді `main`** (id + PASS/FAIL, код виходу):

```
<вивід>
```

**`check-contract.mjs` на фінальному коді** (після перенесення прогону B — 0 FAIL):

```
<вивід>
```
