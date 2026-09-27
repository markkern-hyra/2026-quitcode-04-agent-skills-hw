# Налаштування на боці n8n (словами)

Воркфлоу клієнта — його власність: JSON воркфлоу не експортуємо й не імпортуємо. Адміністратору n8n
клієнта передаємо налаштування текстом — ось так (приклад для події `quote-request`).

1. **Webhook:** HTTP Method `POST`, Path — ім'я події (`quote-request`). Authentication — **Header Auth**,
   credential з Name `x-n8n-token` і Value = `N8N_WEBHOOK_TOKEN`. Неправильний чи відсутній заголовок n8n
   відхиляє з **403** «Authorization data is wrong!». Respond — `Using 'Respond to Webhook' Node` (для швидких
   подій на кшталт `lead-created` — `Immediately`). Якщо в хостингу застосунку фіксовані IP — Options →
   IP(s) Allowlist (за reverse proxy — `N8N_PROXY_HOPS`). У наступних вузлах тіло — `$json.body`,
   заголовки — `$json.headers` (імена в нижньому регістрі).
2. **Respond to Webhook** — одразу за Webhook, **до** Remove Duplicates: Respond With JSON, Response Code `202`,
   тіло `{"job_id": "{{ $execution.id }}"}`. Так 202 отримує й повтор: якби Remove Duplicates стояв раніше,
   відкинутий повтор завершив би виконання, не дійшовши до цього вузла, n8n відповів би стандартним 200, а
   LeadDesk (для воркфлоу з колбеком успіх — лише 202) позначив би запит як `failed`.
3. **Remove Duplicates:** «Remove Items Processed in Previous Executions», значення —
   `{{ $json.headers['idempotency-key'] }}`: повтор далі не йде — другого запуску й колбека немає.
4. … робота воркфлоу (генерація PDF тощо) …
5. **Edit Fields:** поле `ts` = `{{ Math.floor($now.toSeconds()) }}`; поле `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, status: 'completed', correlationId: $('Webhook').item.json.headers['x-correlation-id'], requestIdempotencyKey: $('Webhook').item.json.headers['idempotency-key'], result: { documentUrl: … }, completedAt: $now.toISO() } }) }}`.
   Тіло підписуємо й відправляємо **одним і тим самим рядком**.
6. **Crypto** (v2): Action `Hmac`, Type `SHA256`, Encoding `HEX`, значення `{{ $json.ts + '.' + $json.body }}`,
   credential **Crypto** з Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request:** `POST` на **фіксовану** адресу застосунку — змінна n8n (напр. `LEADDESK_BASE_URL`) +
   `/api/n8n/quote-request`, а не `callbackUrl` із тіла як є: інакше будь-хто з чинним токеном міг би спрямувати
   запит n8n на довільний хост (SSRF, зокрема у внутрішню мережу n8n). Якщо адреса мусить іти з тіла — спершу
   вузол IF: `callbackUrl` починається з дозволеного origin застосунку, інакше зупинити виконання.
   Заголовки: `x-n8n-timestamp` (= `ts`), `x-n8n-signature` (`sha256=` + результат Crypto), `idempotency-key`
   (`{{ $execution.id }}:quote-request.completed` — ті самі `jobId` і `event`, що в тілі), `x-correlation-id`
   (з вхідних заголовків). Body Content Type — **Raw**, Content Type `application/json`, Body — поле `body`.
   Options → Timeout `10000`. Settings → Retry On Fail, Max Tries `3`, Wait Between Tries `1000`.
   Якщо n8n у Docker, а застосунок на хості, — `host.docker.internal`, не `localhost`.
8. **Гілка помилки** (Settings → On Error: Continue (using error output) у робочих вузлах, або Error Trigger):
   той самий Edit Fields → Crypto → HTTP Request, але `event: 'quote-request.failed'`, `status: 'failed'`,
   `error: { code: … }` замість `result`, і **свій** `idempotency-key` —
   `{{ $execution.id }}:quote-request.failed`. Із ключем `…completed` застосунок відповість 400: ключ мусить
   дорівнювати `jobId` і події з підписаного тіла.
9. **Save** і **Publish**. Після кожної зміни — Publish знову.

Чому Raw, а не «JSON → Using Fields Below»: документація n8n не гарантує, що серіалізація полів дасть точно
ті самі байти, що ми підписали.
