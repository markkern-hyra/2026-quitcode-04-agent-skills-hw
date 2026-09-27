# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Рев'ю зроблено **до** встановлення: клон тега поза репозиторієм і `--list`, нічого не встановлюючи.
> Файли скіла читали як дані: нічого з них не виконували, теку не відкривали як проєкт в агенті.

**Дата, інструмент, ОС:** 26–27.09.2026 · Claude Code 2.1.281 (розширення VS Code), модель Opus 5.5 ·
macOS 26.6.2 · zsh · Node 22.20.0 · skills CLI 1.7.0

## Що рев'юємо

| | |
|---|---|
| Репозиторій | <https://github.com/vercel-labs/agent-skills> |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` = коміт `063bee94c3f4df8453406c830b0a7df0f2860278` (merge PR #328, 28.08.2026) |
| Навіщо нам | Клієнт скаржиться: дашборд LeadDesk відкривається понад 2 с, форма «думає». Експерта з продуктивності React у команді немає — беремо 70 правил Vercel для рев'ю й виправлень |

## 1. Подивитись, не встановлюючи

- Як дивились:
  1. `DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278" --list`
     → «Found 9 skills», серед них `vercel-react-best-practices`. У проєкт нічого не записано: `git status`
     чистий, `.agents/` і `.claude/` не з'явились. CLI сам написав «Agent detected — installing
     non-interactively» (див. розділ 3).
  2. `git clone --depth 1 --branch agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 https://github.com/vercel-labs/agent-skills.git ../review-agent-skills`
     → `git rev-parse HEAD` = `063bee94c3f4df8453406c830b0a7df0f2860278`. Команди чеклісту — по теці
     `S=../review-agent-skills/skills/react-best-practices`.
- Склад скіла (76 файлів у клоні; CLI не копіює `metadata.json`, тож після встановлення має бути 75):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 7,2 КБ | frontmatter + покажчик 70 правил за 8 категоріями; каже читати `rules/<id>.md` або `AGENTS.md` |
  | `AGENTS.md` | 108 КБ | усі 70 правил одним згенерованим файлом |
  | `rules/` | 72 файли, 292 КБ | 70 правил (`async-*`, `bundle-*`, `server-*`, `client-*`, `rerender-*`, `rendering-*`, `js-*`, `advanced-*`) + службові `_sections.md` і `_template.md` |
  | `README.md` | 3,4 КБ | README для мейнтейнерів: `pnpm install/build/validate` для теки `src/`, якої в скілі немає |
  | `metadata.json` | 0,9 КБ | версія 1.0.0, «January 2026», «40+ rules» — застаріло (у `SKILL.md` уже 70 правил); CLI його не копіює |

- Frontmatter `SKILL.md`: `name`, `description`, `license: MIT`, `metadata` (`author: vercel`,
  `version: "1.0.0"`). Немає `allowed-tools`, `hooks`, `context`, `disable-model-invocation`.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли | Немає. Єдиний не-markdown файл — `metadata.json` (дані) | `find "$S" -type f ! -name "*.md"` |
| `allowed-tools` | Поля немає — скіл нічого не дозволяє заздалегідь | frontmatter: `awk '/^---$/{n++; next} n==1' "$S/SKILL.md"` |
| Команди під час рендеру `` !`cmd` `` | Немає | `` grep -rn '!`' "$S" `` → порожньо |
| Хуки, MCP-сервери, `plugin.json`, API-ключі | Немає файлів хуків, MCP, plugin чи settings. API-ключі не потрібні: «token» трапляється лише в прикладах коду (`checkAuthToken()`) і в пораді не зберігати токени в localStorage | `find "$S" -name "*hooks*.json" -o -name "*mcp*.json" -o -name "plugin.json" -o -name "settings*.json"` → порожньо; `grep -rniE "api[_ -]?key\|secret\|token\|process\.env"` |
| Інструкції щось завантажити чи виконати | Один збіг: `npx svgo --precision=1 --multipass icon.svg` у `rules/rendering-svg-precision.md:27` (копія — `AGENTS.md:2477`). Це приклад команди для розробника, а не вказівка агенту виконати її зараз; правило не застосовуємо. `README.md` містить `pnpm install/build` для мейнтейнерів — `SKILL.md` на нього не посилається, не виконуємо | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch"`; читання `SKILL.md` і `README.md` |
| Посилання | 35 унікальних URL: документація react.dev, nextjs.org, vercel.com (блог і документація), MDN, webpack, vite, esbuild, npm, GitHub (`node-lru-cache`, `better-all`), csstriggers, jsfiddle, gist, x.com (автор) і `example.com` у прикладах коду. Жодне не подане як «прочитай інструкції звідси», raw-посилань на файли з інструкціями немає | `grep -rhoE "https?://[^]()<> \"'\`]+" "$S" \| sort -u`; `grep -rniE "raw\.githubusercontent\|download (the\|these\|latest)\|fetch (the )?(latest\|rules\|instructions)"` → порожньо |
| Приховані інструкції | Немає HTML-коментарів, «ignore previous», «system prompt», base64-блоків і невидимих символів | `grep -rniE "ignore (all \|the )?previous\|system prompt\|<!--"` → порожньо; `grep -rnoE "[A-Za-z0-9+/]{100,}={0,2}"` → порожньо; node-скрипт із шаблону → «0 file(s) with zero-width characters» |

Висновок розділу: скіл — лише текст. Агент, який його завантажить, отримає поради й приклади коду, але
жодних команд, хуків, дозволів чи мережевих звернень скіл сам не приносить.

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | Pass, ризик SAFE. Зауваження: скіл обробляє код користувача — стандартна поверхня для непрямої prompt-injection, не ознака зловмисного задуму | 14.09.2026, 22:49 |
| Socket | Pass, знахідок немає (malicious behavior, security concerns, obfuscation, suspicious patterns) | 14.09.2026, 22:49 |
| Snyk | Pass, ризик LOW, «No issues detected» | 14.09.2026, 22:48 |

- Де взяли: skills.sh — сторінка скіла і окремі сторінки кожного аудиту
  (`/vercel-labs/agent-skills/vercel-react-best-practices/security/agent-trust-hub`, `…/socket`, `…/snyk`),
  переглянуто 27.09.2026.
- Чому CLI не показав блок «Security Risk Assessments»: `--list` запускали з `DISABLE_TELEMETRY=1` — з ним
  CLI аудити не завантажує. До того ж запуск був з агентської сесії: CLI написав «Agent detected —
  installing non-interactively», тобто вмикає `--yes` і не питає «Proceed with installation?».
  Встановлення теж буде з `DISABLE_TELEMETRY=1`, тож аудити беремо лише з skills.sh.
- До чого прив'язаний аудит: до «репозиторій + назва скіла», а **не** до нашого тега.
  - Жоден звіт не називає версію чи коміт.
  - Socket ідентифікує пакет хешем вмісту
    `pkg:socket/skills-sh/vercel-labs%2Fagent-skills%2Fvercel-react-best-practices%2F@ca7b0c0c…2506212`,
    а не SHA нашого коміту `063bee9…`.
  - Дата аналізу (14.09.2026) пізніша за наш коміт (28.08.2026).
  - Команда встановлення на самій skills.sh — без тега:
    `npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices`.

  Тому аудити — сигнал про репозиторій, а не доказ безпеки саме нашої версії; власне рев'ю (розділ 2)
  замінити ними не можна.

## 4. Ліцензія й походження

- Ліцензія: MIT — у frontmatter `SKILL.md` (`license: MIT`) і в README репозиторію (розділ «License»).
  Файлу `LICENSE` з текстом ліцензії й копірайтом у корені тега немає; skills.sh показує «License: Not
  shown». Для нас (текст вендоримо в клієнтський репозиторій без перепродажу) ризик низький; факт, що
  копірайт-нотису у вендоренні немає, зафіксовано.
- Видавець і активність: GitHub-організація `vercel-labs` (Vercel). Первісний автор — @shuding (Vercel,
  згадка в `README.md` скіла). Наш коміт — merge PR #328 від 28.08.2026. skills.sh: ~746,6 тис.
  встановлень, 31,6 тис. зірок, «First seen» 19.01.2026.

## 5. Чи правдивий зміст для нашого стеку

Звіряли з документацією нашої версії — `node_modules/next/dist/docs/` (Next.js 16.3.5) — ще до встановлення,
за файлами з клону тега. Результати застосування (lint, build, числа) — у `docs/verification.md`.

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `bundle-dynamic-imports` | Приклад `dynamic(() => import('./monaco-editor'), { ssr: false })` — без `'use client'` | `01-app/02-guides/lazy-loading.md:94–95`: «`ssr: false` option is not supported in Server Components… Please move it into a Client Component» | Правдиво лише для Client Components. `ssr: false` ставимо тільки в `components/leads-toolbar.tsx` (має `"use client"`); у Server Component така порада зламала б збірку |
| `bundle-barrel-imports` | Серед «уражених» бібліотек — `lodash`, `recharts`, `lucide-react`; радить `optimizePackageImports` | `01-app/03-api-reference/05-config/01-next-config-js/optimizePackageImports.md:21–50`: за замовчуванням уже оптимізуються `lucide-react`, `lodash-es`, `recharts` та ін., але не `lodash` | Для `recharts` порада зайва — Next.js 16 робить це сам. `lodash` (CJS) у списку немає — лишаємо кандидатом, у цій домашці не застосовуємо |
| `server-cache-react` | `React.cache()` для запитів не через `fetch`; не передавати inline-об'єкти (Object.is); `fetch` мемоізується сам | `01-app/01-getting-started/06-fetching-data.md:546–604` — `React.cache` для доступу до БД, область — один запит; `01-app/04-glossary.md:135` — автоматично мемоізуються лише `fetch` GET і не в Route Handlers | Правдиво (з уточненням про GET і Route Handlers). Застосовуємо в `lib/data.ts`: `getWorkspace({ slug })` — рівно «incorrect»-приклад правила |
| `server-after-nonblocking` | `after()` працює в Server Actions, Route Handlers і Server Components; у прикладі читає `headers()`/`cookies()` всередині `after` | `01-app/03-api-reference/04-functions/after.md:120` — у Server Components `cookies`/`headers` усередині `after` не можна; `after.md:302` — стабільний з v15.1.0 | Правдиво з уточненням: приклад з `headers()` в `after` годиться для Route Handler і Server Action, не для сторінки. У Task A не застосовуємо: виклик n8n в `app/actions.ts` переробляємо в Task D за контрактом n8n |
| `server-serialization` | Передавати в Client Component лише ті поля, які він використовує | `01-app/02-guides/data-security.md:64` — мінімальні DTO; `:441` — «Only return what the UI needs, not raw database records» | Правдиво. Застосовуємо до `LeadsTable`: зараз отримує весь `Lead` разом з `internalNotes`, IP і `rawPayload` |

## 6. Закріплення версії й коміт

- Команда встановлення (запускає людина у своєму терміналі, не агент — див. розділ 3 про `--yes`):
  `DISABLE_TELEMETRY=1 npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 --skill vercel-react-best-practices -a claude-code --copy`,
  Installation scope → **Project**.
- Де лягли файли; справжні файли чи посилання: `.claude/skills/vercel-react-best-practices/` — справжні
  файли завдяки `--copy`; без `.agents/` (перевірка після встановлення — у `docs/verification.md`).
- Що потрапило в git: тека скіла (75 файлів) і `skills-lock.json` (джерело, тег, хеш).
- Як оновлювати: та сама команда з новим тегом → `git diff -- .claude/skills/vercel-react-best-practices skills-lock.json`
  → рев'ю змін за цим чеклістом → коміт. Файли Vercel руками не редагуємо. `npx skills@1.7.0 experimental_install`
  для відновлення не годиться: пише лише в `.agents/skills/`, яку Claude Code не читає.

## Вердикт

**Встановити з умовами.** Ризик низький: скіл — лише текст (70 правил у markdown і покажчик), без скриптів,
хуків, MCP, `allowed-tools`, команд під час рендеру й мережевих інструкцій агенту; посилання ведуть на
документацію; усі три аудити — Pass, хоча й не прив'язані до нашого тега.

Умови:

1. Лише закріплений тег `agent-skills-063bee9…` і справжні файли (`--copy`) у git разом зі `skills-lock.json`.
2. Кожну пораду перед застосуванням звіряємо з `node_modules/next/dist/docs/` — відомі розбіжності в
   розділі 5.
3. Не виконуємо команди з `README.md` скіла і `npx svgo` з `rendering-svg-precision`.
4. Оновлюємо лише новим тегом, через рев'ю за цим чеклістом, без правок файлів Vercel руками.
