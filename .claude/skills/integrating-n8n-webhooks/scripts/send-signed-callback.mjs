#!/usr/bin/env node
// Callback matrix for the team's n8n -> Next.js callback route (skill integrating-n8n-webhooks):
// sends callbacks signed the way n8n signs them and checks the status code of each case.
// Node built-ins only. Takes the secret from the environment and never prints it, the
// signatures, the bodies or the idempotency keys.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const USAGE = `send-signed-callback - callback matrix against POST /api/n8n/<event>

Usage:
  node --env-file=.env.local send-signed-callback.mjs --url <callback url> [--request-key <key>]

Options:
  --url <url>            The app's callback route, e.g. http://127.0.0.1:3000/api/n8n/quote-request.
                         The last path segment is the event.
  --request-key <key>    The idempotency-key of a real queued record (the key the app sent to
                         n8n). Adds the valid case: 202, then the same callback again -> 200
                         {"duplicate":true}. It CHANGES that record: use one made for testing.
  -h, --help             Show this help.

Environment (never pass secrets as flags):
  N8N_CALLBACK_SECRET    The HMAC secret the route verifies with. Required.

Cases (expected code):
  unknown event in the path                        404
  inherited property as the event (/constructor)   404  (handler lookup must use own keys only)
  content-type text/plain                          415
  body larger than 64 KB                           413
  timestamp 10 min in the past / in the future     401
  no x-n8n-timestamp / no x-n8n-signature          401
  signature made with another secret               401
  signature of a different length                  401  (not 500: length check before timingSafeEqual)
  body reformatted after signing                   401
  no idempotency-key                               400
  idempotency-key is not <jobId>:<event>, twice    400, 400  (the key is released after a 400)
  event in the body is not the path's event        400
  signed body is not JSON                          400
  valid callback, then the same again              202, 200 {"duplicate":true}  (only with --request-key)

Signature: x-n8n-signature: sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "<timestamp>.<raw body>")>,
x-n8n-timestamp: <unix seconds>, idempotency-key: <data.jobId>:<event from the body>.

Prints each case, the expected and the actual code. Never prints the secret, signatures,
bodies or keys. Exit code: 0 - every case as expected, 1 - at least one differs,
2 - usage error, missing secret or the app is unreachable.
`;

function usageError(message) {
  process.stderr.write(`send-signed-callback: ${message}\nRun with --help for usage.\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      url: { type: "string" },
      "request-key": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
} catch (error) {
  usageError(error.message);
}
if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (!args.url) usageError("--url is required");
let target;
try {
  target = new URL(args.url);
} catch {
  usageError("--url is not a URL");
}
if (target.protocol !== "http:" && target.protocol !== "https:") usageError("--url must be an http(s) URL");
const segments = target.pathname.split("/").filter(Boolean);
const event = segments.at(-1);
if (!event) usageError("--url must end with the event, e.g. /api/n8n/quote-request");
const urlFor = (name) => {
  const url = new URL(target);
  url.pathname = `/${[...segments.slice(0, -1), name].join("/")}`;
  return url;
};

const secret = process.env.N8N_CALLBACK_SECRET;
if (!secret) usageError("N8N_CALLBACK_SECRET is not set: run with node --env-file=.env.local ...");

const TIMEOUT_MS = 10_000;
const now = () => Math.floor(Date.now() / 1000);
const sign = (raw, timestamp, key = secret) =>
  `sha256=${createHmac("sha256", key).update(`${timestamp}.${raw}`).digest("hex")}`;

function callbackBody({ bodyEvent = `${event}.completed`, requestKey = randomUUID(), extra = {} } = {}) {
  const jobId = randomUUID();
  return {
    version: 1,
    event: bodyEvent,
    data: {
      jobId,
      status: "completed",
      correlationId: randomUUID(),
      requestIdempotencyKey: requestKey,
      result: { documentUrl: `https://files.example.test/n8n/${jobId}.pdf` },
      completedAt: new Date().toISOString(),
      ...extra,
    },
  };
}

// A correctly signed callback unless a case overrides one part of it.
function callback({ url = target, body = callbackBody(), raw, signedRaw, timestamp, signature, contentType, key, omit = [] } = {}) {
  const text = raw ?? JSON.stringify(body);
  const ts = timestamp ?? String(now());
  const headers = {
    "content-type": contentType ?? "application/json",
    "x-n8n-timestamp": ts,
    "x-n8n-signature": signature ?? sign(signedRaw ?? text, ts),
    "idempotency-key": key ?? `${body.data.jobId}:${body.event}`,
    "x-correlation-id": body.data.correlationId,
  };
  for (const name of omit) delete headers[name];
  return { url, headers, text };
}

const cases = [
  ["unknown event in the path", [404], () =>
    callback({ url: urlFor("no-such-event"), body: callbackBody({ bodyEvent: "no-such-event.completed" }) })],
  ["inherited property as the event (/constructor)", [404], () =>
    callback({ url: urlFor("constructor"), body: callbackBody({ bodyEvent: "constructor.completed" }) })],
  ["content-type text/plain", [415], () => callback({ contentType: "text/plain" })],
  ["body larger than 64 KB", [413], () => callback({ body: callbackBody({ extra: { padding: "x".repeat(65 * 1024) } }) })],
  ["timestamp 10 min in the past", [401], () => callback({ timestamp: String(now() - 600) })],
  ["timestamp 10 min in the future", [401], () => callback({ timestamp: String(now() + 600) })],
  ["no x-n8n-timestamp", [401], () => callback({ omit: ["x-n8n-timestamp"] })],
  ["no x-n8n-signature", [401], () => callback({ omit: ["x-n8n-signature"] })],
  ["signature made with another secret", [401], () => {
    const body = callbackBody();
    const ts = String(now());
    return callback({ body, timestamp: ts, signature: sign(JSON.stringify(body), ts, randomBytes(32).toString("hex")) });
  }],
  ["signature of a different length", [401], () => callback({ signature: "sha256=00" })],
  ["body reformatted after signing", [401], () => {
    const body = callbackBody();
    return callback({ body, raw: JSON.stringify(body, null, 2), signedRaw: JSON.stringify(body) });
  }],
  ["no idempotency-key", [400], () => callback({ omit: ["idempotency-key"] })],
  ["idempotency-key is not <jobId>:<event>, sent twice", [400, 400], () => callback({ key: randomUUID() })],
  ["event in the body is not the path's event", [400], () =>
    callback({ body: callbackBody({ bodyEvent: "another-event.completed" }) })],
  ["signed body is not JSON", [400], () => callback({ raw: "not json" })],
];
if (args["request-key"]) {
  cases.push(["valid callback, then the same again", [202, 200], () =>
    callback({ body: callbackBody({ requestKey: args["request-key"] }) })]);
}

async function send({ url, headers, text }) {
  const response = await fetch(url, { method: "POST", headers, body: text, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const reply = await response.text();
  let duplicate = false;
  try {
    duplicate = JSON.parse(reply)?.duplicate === true;
  } catch {
    // not JSON: fine for every code except the duplicate 200
  }
  return { status: response.status, duplicate };
}

console.log(`send-signed-callback - POST ${target.origin}${target.pathname} (event ${event})`);
let passed = 0;
let failed = 0;
for (const [name, expected, build] of cases) {
  const request = build();
  const got = [];
  let ok = true;
  for (let step = 0; step < expected.length; step++) {
    let result;
    try {
      result = await send(request); // a repeat sends the very same bytes, like n8n's Retry On Fail
    } catch (error) {
      process.stderr.write(`send-signed-callback: cannot reach ${target.origin}: ${error.cause?.code ?? error.name}\n`);
      process.exit(2);
    }
    got.push(result.status);
    if (result.status !== expected[step]) ok = false;
    if (expected[step] === 200 && step > 0 && !result.duplicate) ok = false;
  }
  const expectText = expected.join(" -> ");
  const detail = ok ? "" : ` (got ${got.join(" -> ")}${expected.includes(200) && got.at(-1) === 200 ? ", no {\"duplicate\":true}" : ""})`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${expectText.padEnd(10)}  ${name}${detail}`);
  if (ok) passed++;
  else failed++;
}
if (!args["request-key"]) console.log("SKIP  202 -> 200  valid callback, then the same again (needs --request-key)");
console.log(`Result: ${passed} as expected, ${failed} different${args["request-key"] ? "" : ", 1 skipped"}`);
process.exit(failed ? 1 : 0);
