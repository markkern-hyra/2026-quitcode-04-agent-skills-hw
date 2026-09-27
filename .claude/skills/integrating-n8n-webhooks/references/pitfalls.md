# Відомі пастки й межі скіла

## Пастки в документації й чужих скілах

- «Workflow got started» (документація n8n) проти `Workflow was started` (код n8n) — тому текст відповіді не
  парсимо, лише код статусу.
- Офіційний пакет скілів n8n пише, що Header Auth відхиляє запит з **401**; код n8n повертає **403**
  («Authorization data is wrong!»). 401 — для Basic Auth і JWT.
- Той самий пакет пише, що секрет вузла Crypto не прив'язується до credential. Для Crypto v2 це вже не так:
  документація й код використовують Hmac Secret із Crypto credential.
- Приклад вебхука в документації Next.js передає токен у `?token=` GET-запиту й порівнює через `!==`. Той самий
  гайд попереджає, що GET-запити можуть кешуватись і потрапляти в журнали. Ми суворіші: токен у заголовку,
  підпис і `timingSafeEqual`.
- Тестовий URL (`/webhook-test/…`) «працює» лише 120 с після «Listen for test event» — у коді здається, що все
  гаразд, а заявки губляться. Мок n8n поводиться так само: без `--listen` тестові URL дають 404.

## Межі перевірок

- `scripts/check-contract.mjs` — статичні евристики: PASS означає, що шаблон контракту є в коді, а не що
  інтеграція працює. Порядок і коди колбека перевіряє `scripts/send-signed-callback.mjs` проти запущеного
  застосунку; наприклад, ключ, не звільнений після 400, бачить лише матриця (повтор дає 200 замість 400).
- Тож Verify — обидва скрипти й сценарій з моком, а не лише «0 FAIL».

## Поза межами скіла

- Побудова й зміна воркфлоу в редакторі n8n, експорт чи імпорт JSON воркфлоу.
- Код для вузла Code в n8n.
- Черги й фонові воркери: для наших об'ємів вистачає `after()` і колбеків.

## Локальна розробка: мок n8n

`scripts/mock-n8n.mjs` — локальний «n8n» без залежностей (копія інструмента команди `tools/mock-n8n.mjs` з
двома відмінностями: повтор `idempotency-key` отримує першу відповідь без нового запуску й колбека, як за
Remove Duplicates; у журналі з `--callback-url` — лише origin і шлях): поводиться як вузли
Webhook, Respond to Webhook і HTTP Request з підписом, тож доступ до n8n клієнта не потрібен.

```bash
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --help
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs                      # :5678, Immediately
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode slow --cloud-timeout 5000   # 524, як на Cloud
node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000
#   ↑ з N8N_WEBHOOK_TOKEN вмикається Header Auth, з N8N_CALLBACK_SECRET — підписаний колбек на callbackUrl через 5 с
```

У журналі мока — метод, шлях, статус, тривалість, **імена** заголовків, розмір і sha256 тіла, `auth=` і
`idempotency=new|repeat|absent`. Тіл і значень він не пише.
