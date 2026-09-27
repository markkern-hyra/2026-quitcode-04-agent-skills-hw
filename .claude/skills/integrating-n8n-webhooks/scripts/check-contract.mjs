#!/usr/bin/env node
// Static check of a Next.js project against the team's Next.js <-> n8n contract
// (skill integrating-n8n-webhooks). Node built-ins only. Reads code files and
// .env.example; never reads .env.local or any other .env file and never prints values.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const CHECKS = [
  ["C1", "No test webhook URLs (/webhook-test/) in code or .env.example"],
  ["C2", "n8n variables stay server-only (no NEXT_PUBLIC_N8N_*)"],
  ["C3", 'n8n is called only from lib/n8n/client.ts, which starts with import "server-only"'],
  ["C4", "Every request to n8n has a timeout (signal: AbortSignal.timeout(...))"],
  ["C5", "Requests to n8n send x-n8n-token, idempotency-key and x-correlation-id"],
  ["C6", "The request body is an envelope {version, event, data}, not a raw record"],
  ["C7", "Server Actions do not wait for n8n (the call runs inside after())"],
  ["C8", "Callback reads the raw body (request.text()) and parses JSON only after the signature check"],
  ["C9", "Callback signature: HMAC with a length check + timingSafeEqual, never ==="],
  ["C10", "Callback rejects a stale x-n8n-timestamp (300 s window)"],
  ["C11", "Callback claims idempotency-key and ties it to data.jobId and the event"],
  ["C12", 'No edge runtime (export const runtime = "edge")'],
  ["C13", ".env.example has N8N_WEBHOOK_BASE_URL (.../webhook), N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET, APP_BASE_URL; secrets are change-me-..."],
  ["C14", "No request bodies, personal data or secrets in console.* logs"],
];

const USAGE = `check-contract - static checks against the team's Next.js <-> n8n contract

Usage:
  node check-contract.mjs [--root <dir>] [--changed-since <git-ref>]

Options:
  --root <dir>            Project to check (default: the current directory).
  --changed-since <ref>   Report only what changed since <ref>: files changed in git
                          (committed, staged or not) and new untracked files; in files
                          that already existed, only the changed lines.
  -h, --help              Show this help.

Checks (each prints PASS, FAIL or N/A; every FAIL line gives file:line):
${CHECKS.map(([id, title]) => `  ${id.padEnd(4)} ${title}`).join("\n")}

Exit code: 0 - no FAIL, 1 - at least one FAIL, 2 - usage or git error.

Scans *.ts, *.tsx, *.js, *.jsx, *.mjs, *.cjs and .env.example; skips node_modules, .next,
.git, .claude, tools, docs and materials. Never reads .env.local; prints key names, never
values. The checks are static heuristics: a PASS means the contract's pattern is in the
code, not that the integration works - run the mock scenario as well.
`;

function usageError(message) {
  process.stderr.write(`check-contract: ${message}\nRun with --help for usage.\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      root: { type: "string" },
      "changed-since": { type: "string" },
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

const root = path.resolve(args.root ?? process.cwd());
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) usageError(`--root is not a directory: ${root}`);

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

// Same-length copy of src with comments blanked and, if `strings`, the text of string
// and template literals blanked too (${...} expressions stay). Newlines are kept, so
// indices and line numbers match the original.
function mask(src, strings) {
  const out = src.split("");
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  function scanString(start, quote) {
    let j = start + 1;
    while (j < n && src[j] !== quote && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
    if (strings) blank(start + 1, j);
    return j + 1;
  }
  function scanTemplate(start) {
    let j = start + 1;
    while (j < n) {
      if (src[j] === "\\") {
        if (strings) blank(j, j + 2);
        j += 2;
      } else if (src[j] === "`") {
        return j + 1;
      } else if (src[j] === "$" && src[j + 1] === "{") {
        j = scanCode(j + 2, true);
      } else {
        if (strings) blank(j, j + 1);
        j++;
      }
    }
    return n;
  }
  function scanCode(start, untilBrace) {
    let j = start;
    let depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === "/" && src[j + 1] === "/") {
        const end = src.indexOf("\n", j);
        blank(j, end < 0 ? n : end);
        j = end < 0 ? n : end;
      } else if (c === "/" && src[j + 1] === "*") {
        const end = src.indexOf("*/", j + 2);
        blank(j, end < 0 ? n : end + 2);
        j = end < 0 ? n : end + 2;
      } else if (c === '"' || c === "'") {
        j = scanString(j, c);
      } else if (c === "`") {
        j = scanTemplate(j);
      } else {
        if (untilBrace && c === "{") depth++;
        if (untilBrace && c === "}") {
          if (depth === 0) return j + 1;
          depth--;
        }
        j++;
      }
    }
    return n;
  }
  scanCode(0, false);
  return out.join("");
}

// Index of the bracket that closes the one at `open` (code must be masked).
function matchClose(code, open) {
  const closer = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  for (let j = open; j < code.length; j++) {
    const c = code[j];
    if (closer[c]) stack.push(closer[c]);
    else if (c === ")" || c === "]" || c === "}") {
      stack.pop();
      if (stack.length === 0) return j;
    }
  }
  return code.length;
}

function firstTopLevelComma(code, from, to) {
  let depth = 0;
  for (let j = from; j < to; j++) {
    const c = code[j];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) return j;
  }
  return to;
}

function* matches(text, regex) {
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    yield m;
    if (m[0].length === 0) re.lastIndex++;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".claude", ".agents", ".cursor", ".codex",
  "tools", "docs", "materials", "coverage", "out", "build", ".vercel", ".turbo",
]);
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;

function walk(dir, prefix = "") {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && CODE_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      found.push(rel);
    }
  }
  return found;
}

function load(rel) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === "\n") lineStarts.push(k + 1);
  return { rel, text, noComments: mask(text, false), code: mask(text, true), lineStarts };
}

const files = walk(root).map(load);
const byRel = new Map(files.map((f) => [f.rel, f]));

function lineOf(file, index) {
  let lo = 0;
  let hi = file.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (file.lineStarts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function linesAbove(file, line, count) {
  const from = file.lineStarts[Math.max(0, line - 1 - count)];
  const to = file.lineStarts[line] ?? file.text.length;
  return file.noComments.slice(from, to);
}

// Only this env file is ever read.
const ENV_REL = ".env.example";
const envPath = path.join(root, ENV_REL);
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;
const envLines = envText === null ? [] : envText.split(/\r?\n/);

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const findings = new Map(CHECKS.map(([id]) => [id, []]));
const notApplicable = new Map();
const fail = (id, rel, line, message) => findings.get(id).push({ rel, line, message });

const isClientModule = (rel) => /^(?:src\/)?lib\/n8n\/client\.[cm]?[jt]sx?$/.test(rel);
const isN8nModule = (rel) => /^(?:src\/)?lib\/n8n\//.test(rel);
const usesServer = (f) => /^\s*(?:"use server"|'use server')/.test(f.noComments);
const referencesN8nEnv = (f) => /process\.env\.N8N_|process\.env\[\s*["']N8N_/.test(f.noComments);

// C1, C2 - URLs and public variables ---------------------------------------
for (const f of files) {
  for (const m of matches(f.noComments, /\bwebhook-test\b/)) {
    fail("C1", f.rel, lineOf(f, m.index), "test webhook URL (/webhook-test/): use the production /webhook/ URL");
  }
  for (const m of matches(f.noComments, /NEXT_PUBLIC_N8N_\w*/)) {
    fail("C2", f.rel, lineOf(f, m.index), `${m[0]} would be bundled into client JavaScript`);
  }
}
envLines.forEach((line, i) => {
  if (/^\s*#/.test(line)) return;
  if (/\bwebhook-test\b/.test(line)) fail("C1", ENV_REL, i + 1, "test webhook URL (/webhook-test/) in .env.example");
  const pub = /NEXT_PUBLIC_N8N_\w*/.exec(line);
  if (pub) fail("C2", ENV_REL, i + 1, `${pub[0]} would be bundled into client JavaScript`);
});

// Requests to n8n ------------------------------------------------------------
const n8nCalls = [];
for (const f of files) {
  for (const m of matches(f.code, /(?<![\w$.])fetch\s*\(|\bglobalThis\s*\.\s*fetch\s*\(/)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(f.code, open);
    const firstArg = f.text.slice(open + 1, firstTopLevelComma(f.code, open + 1, close));
    const line = lineOf(f, m.index);
    const isN8n =
      isClientModule(f.rel) ||
      referencesN8nEnv(f) ||
      /n8n|webhook/i.test(firstArg) ||
      /n8n|webhook/i.test(linesAbove(f, line, 10));
    if (isN8n) n8nCalls.push({ f, index: m.index, line, args: f.text.slice(open + 1, close) });
  }
}
const clientModules = files.filter((f) => isClientModule(f.rel));
const callsByFile = new Map();
for (const call of n8nCalls) {
  if (!callsByFile.has(call.f.rel)) callsByFile.set(call.f.rel, []);
  callsByFile.get(call.f.rel).push(call);
}

// C3 - one server-only module
if (n8nCalls.length === 0 && clientModules.length === 0) {
  notApplicable.set("C3", "no requests to n8n found");
} else {
  for (const call of n8nCalls) {
    if (!isClientModule(call.f.rel)) fail("C3", call.f.rel, call.line, "request to n8n outside lib/n8n/client.ts");
  }
  for (const f of clientModules) {
    const first = f.noComments.split(/\r?\n/).find((l) => l.trim() !== "");
    if (!/^\s*import\s+["']server-only["'];?\s*$/.test(first ?? "")) {
      fail("C3", f.rel, 1, 'first statement is not import "server-only"');
    }
  }
}

// C4 - timeout on every request
if (n8nCalls.length === 0) notApplicable.set("C4", "no requests to n8n found");
for (const call of n8nCalls) {
  const inArgs = /AbortSignal\s*\.\s*timeout\s*\(/.test(call.args);
  const viaVariable = /\bsignal\b/.test(call.args) && /AbortSignal\s*\.\s*timeout\s*\(/.test(linesAbove(call.f, call.line, 15));
  if (!inArgs && !viaVariable) fail("C4", call.f.rel, call.line, "no timeout: add signal: AbortSignal.timeout(10_000)");
}

// C5 - headers, C6 - envelope
if (n8nCalls.length === 0) {
  notApplicable.set("C5", "no requests to n8n found");
  notApplicable.set("C6", "no requests to n8n found");
}
const n8nModuleText = files.filter((f) => isN8nModule(f.rel)).map((f) => f.noComments).join("\n");
for (const [rel, calls] of callsByFile) {
  const f = byRel.get(rel);
  const missing = ["x-n8n-token", "idempotency-key", "x-correlation-id"].filter(
    (header) => !new RegExp(header, "i").test(f.noComments),
  );
  if (missing.length) fail("C5", rel, calls[0].line, `missing header(s): ${missing.join(", ")}`);
  const pool = isN8nModule(rel) ? n8nModuleText : f.noComments;
  const envelope = /\bversion\s*:\s*\d/.test(pool) && /\bevent\s*[:,}]/.test(pool) && /\bdata\s*[:,}]/.test(pool);
  if (!envelope) fail("C6", rel, calls[0].line, "the body is not an envelope { version: 1, event, data }");
}

// C7 - Server Actions do not wait for n8n
function importedN8nNames(f) {
  const names = [];
  const namespaces = [];
  for (const m of matches(f.noComments, /import\s+(?!type\s)([\w$\s{},*]+?)\s+from\s+["']([^"']*n8n[^"']*)["']/)) {
    const clause = m[1];
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (ns) namespaces.push(ns[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(",")) {
        const item = part.trim().replace(/^type\s+/, "");
        if (!item || part.trim().startsWith("type ")) continue;
        const alias = /\bas\s+([\w$]+)$/.exec(item);
        names.push(alias ? alias[1] : item);
      }
    }
    const def = /^\s*([\w$]+)\s*(?:,|$)/.exec(clause);
    if (def) names.push(def[1]);
  }
  return { names, namespaces };
}
let actionCalls = 0;
for (const f of files.filter(usesServer)) {
  const { names, namespaces } = importedN8nNames(f);
  const callIndexes = (callsByFile.get(f.rel) ?? []).map((c) => c.index);
  const importEnd = f.code.lastIndexOf("import ");
  for (const name of names) {
    for (const m of matches(f.code, new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\s*\\(`))) {
      if (m.index > importEnd) callIndexes.push(m.index);
    }
  }
  for (const ns of namespaces) {
    for (const m of matches(f.code, new RegExp(`\\b${ns}\\s*\\.\\s*[\\w$]+\\s*\\(`))) callIndexes.push(m.index);
  }
  if (callIndexes.length === 0) continue;
  actionCalls += callIndexes.length;
  const spans = [];
  for (const m of matches(f.code, /(?<![\w$.])after\s*\(/)) {
    const open = m.index + m[0].length - 1;
    spans.push([open, matchClose(f.code, open)]);
  }
  for (const index of callIndexes) {
    if (!spans.some(([a, b]) => index > a && index < b)) {
      fail("C7", f.rel, lineOf(f, index), "the Server Action waits for n8n: move the call into after()");
    }
  }
}
if (actionCalls === 0) notApplicable.set("C7", "no calls to n8n from Server Actions found");

// Callback routes ------------------------------------------------------------
function resolveImports(f) {
  const found = [];
  for (const m of matches(f.noComments, /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/)) {
    const spec = m[1];
    let base;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.join(path.posix.dirname(f.rel), spec);
    else continue;
    const candidates = [base, ...[".ts", ".tsx", ".js", ".mjs", ".cjs", "/index.ts", "/index.js"].map((ext) => base + ext)];
    const hit = candidates.map((c) => byRel.get(c)).find(Boolean);
    if (hit && hit !== f) found.push(hit);
  }
  return found;
}

function handlerSpan(f) {
  const m = /export\s+(?:async\s+)?function\s+POST\s*\(/.exec(f.code) ?? /export\s+const\s+POST\s*=/.exec(f.code);
  if (!m) return [0, f.code.length];
  let j = m.index + m[0].length;
  if (m[0].includes("function")) j = matchClose(f.code, j - 1) + 1;
  else j = f.code.indexOf("=>", j) + 2;
  const open = f.code.indexOf("{", j);
  return open < 0 ? [0, f.code.length] : [open, matchClose(f.code, open)];
}

// Names of the functions declared in `set` whose body passes `test`.
function functionNames(set, test) {
  const names = new Set();
  for (const f of set) {
    const decls = [
      ...matches(f.code, /function\s+([\w$]+)\s*\(/),
      ...matches(f.code, /(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]*)?=>/),
    ];
    for (const m of decls) {
      const open = f.code.indexOf("{", m.index + m[0].length - 1);
      if (open < 0) continue;
      if (test(f.code.slice(open, matchClose(f.code, open)))) names.add(m[1]);
    }
  }
  return names;
}

const callPattern = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\s*\\(`);
const callsAny = (code, names) => [...names].some((name) => callPattern(name).test(code));

// Functions declared in `set` that pass `direct` themselves or call one that does (any depth).
function functionsReaching(set, direct) {
  let names = functionNames(set, direct);
  for (let grown = true; grown; ) {
    const next = functionNames(set, (code) => direct(code) || callsAny(code, names));
    grown = next.size > names.size;
    names = next;
  }
  return names;
}

// Is the 300 s window used in `body`: written there, via a constant, or via a function that
// uses it (at any depth)? A window helper that the handler never calls does not count.
function usesWindow(set, body) {
  const WINDOW = /\b300\b|\b5\s*\*\s*60\b|\b300_?000\b/;
  const constants = new Set();
  for (const f of set) {
    for (const m of matches(f.code, /(?:const|let)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:300_?000|300|5\s*\*\s*60)\b/)) constants.add(m[1]);
  }
  const direct = (code) => WINDOW.test(code) || [...constants].some((c) => new RegExp(`(?<![\\w$.])${c}\\b`).test(code));
  return direct(body) || callsAny(body, functionsReaching(set, direct));
}

const ROUTE_FILE = /^(?:src\/)?app\/(?:.*\/)?route\.[cm]?[jt]sx?$/;
const callbackRoutes = files.filter(
  (f) =>
    ROUTE_FILE.test(f.rel) &&
    /export\s+(?:async\s+)?function\s+POST\b|export\s+const\s+POST\b/.test(f.noComments) &&
    (/x-n8n-(?:signature|timestamp)|n8n/i.test(f.noComments) || /n8n|callback|webhook/i.test(f.rel)),
);

if (callbackRoutes.length === 0) {
  let sent = null;
  for (const f of files) {
    const m = /\bcallback_?url\b/i.exec(f.noComments);
    if (m) {
      sent = { f, line: lineOf(f, m.index) };
      break;
    }
  }
  for (const id of ["C8", "C9", "C10", "C11"]) {
    if (sent) fail(id, sent.f.rel, sent.line, "callbackUrl is sent to n8n, but no POST route handler for n8n callbacks was found");
    else notApplicable.set(id, "no n8n callback route found");
  }
}

for (const route of callbackRoutes) {
  const set = [route, ...resolveImports(route)];
  const [start, end] = handlerSpan(route);
  const handlerLine = lineOf(route, start);
  const body = route.code.slice(start, end);

  // C8
  for (const m of matches(route.code, /\b(?:req|request)\s*\.\s*json\s*\(/)) {
    fail("C8", route.rel, lineOf(route, m.index), "request.json() re-serializes the body: read request.text() and verify the signature first");
  }
  if (!/\.\s*(?:text|arrayBuffer)\s*\(\s*\)/.test(body)) {
    fail("C8", route.rel, handlerLine, "the body is not read as raw text (await request.text())");
  }
  // Parsers and verifiers: by what their body reaches (any depth), and verifiers also by name.
  const parsers = functionsReaching(set, (code) => /JSON\s*\.\s*parse\s*\(/.test(code));
  const verifiers = functionsReaching(set, (code) => /timingSafeEqual\s*\(/.test(code));
  const parseAt = [];
  for (const m of matches(body, /JSON\s*\.\s*parse\s*\(|(?<![\w$.])parse(?!Int\b|Float\b)[A-Za-z]*\s*\(/)) parseAt.push(m.index);
  for (const name of parsers) {
    for (const m of matches(body, callPattern(name))) parseAt.push(m.index);
  }
  const verifyAt = [
    ...matches(body, /timingSafeEqual\s*\(|(?<![\w$.])[\w$]*(?:verif|valid|check)[\w$]*sign[\w$]*\s*\(|(?<![\w$.])[\w$]*sign[\w$]*(?:verif|valid)[\w$]*\s*\(/i),
  ].map((m) => m.index);
  for (const name of verifiers) {
    for (const m of matches(body, callPattern(name))) verifyAt.push(m.index);
  }
  const firstParse = Math.min(...parseAt);
  const firstVerify = Math.min(...verifyAt);
  if (parseAt.length && firstParse < firstVerify) {
    fail("C8", route.rel, lineOf(route, start + firstParse), "JSON is parsed before the signature is verified");
  }

  // C9
  const setCode = set.map((f) => f.noComments).join("\n");
  const hasHmac = /createHmac\s*\(/.test(setCode);
  const hasTimingSafe = /timingSafeEqual\s*\(/.test(setCode);
  if (!hasHmac && !hasTimingSafe) {
    fail("C9", route.rel, handlerLine, "no HMAC signature check (createHmac + timingSafeEqual)");
  } else if (!hasTimingSafe) {
    const f = set.find((x) => /createHmac\s*\(/.test(x.noComments));
    fail("C9", f.rel, lineOf(f, f.noComments.search(/createHmac\s*\(/)), "the signature is compared without timingSafeEqual");
  } else if (!hasHmac) {
    const f = set.find((x) => /timingSafeEqual\s*\(/.test(x.noComments));
    fail("C9", f.rel, lineOf(f, f.noComments.search(/timingSafeEqual\s*\(/)), "no HMAC of the body: verify sha256=HMAC(N8N_CALLBACK_SECRET, \"<timestamp>.<raw body>\")");
  }
  // A line compares a signature with ===/!== (whole identifier parts only: "assignedTo" is not "sig").
  const comparesSignature = (line, words) => {
    if (!/[!=]==?/.test(line) || /\.length|byteLength|typeof/.test(line)) return false;
    if (/[!=]==?\s*(?:null|undefined|""|''|0|false|true)\b|\b(?:null|undefined)\s*[!=]==?/.test(line)) return false;
    return (line.match(/[A-Za-z_$][\w$]*/g) ?? []).some((id) =>
      id.split(/_|(?<=[a-z0-9])(?=[A-Z])/).some((part) => words.has(part.toLowerCase())),
    );
  };
  const SIGNATURE_WORDS = new Set(["sig", "signature", "hmac", "digest"]);
  const SIGNATURE_OR_EXPECTED = new Set([...SIGNATURE_WORDS, "expected"]);
  for (const f of set) {
    const at = f.noComments.search(/timingSafeEqual\s*\(/);
    const words = at < 0 ? SIGNATURE_WORDS : SIGNATURE_OR_EXPECTED;
    if (at >= 0 && !/\.length\s*[!=]==?|[!=]==?\s*[\w$.]+\.length\b|byteLength/.test(f.code)) {
      fail("C9", f.rel, lineOf(f, at), "timingSafeEqual without a length check (it throws on different lengths)");
    }
    f.code.split("\n").forEach((line, i) => {
      if (comparesSignature(line, words)) fail("C9", f.rel, i + 1, "the signature is compared with ===/!==: use timingSafeEqual");
    });
  }

  // C10, C11
  const setText = set.map((f) => f.noComments).join("\n");
  if (!/x-n8n-timestamp/i.test(setText) || !usesWindow(set, body)) {
    fail("C10", route.rel, handlerLine, "a stale x-n8n-timestamp is not rejected: the POST handler must check the 300 s window");
  }
  if (!/idempotency-key/i.test(setText) || !/\bjobId\b/.test(setText) || !/claim|reserve|\.add\s*\(|insert|setnx|unique/i.test(setText)) {
    fail("C11", route.rel, handlerLine, "idempotency-key is not claimed or not checked against data.jobId and the event");
  }
}

// C12 - runtime
for (const f of files) {
  for (const m of matches(f.noComments, /export\s+const\s+runtime\s*=\s*["'`]edge["'`]/)) {
    fail("C12", f.rel, lineOf(f, m.index), 'runtime = "edge": the contract needs node:crypto (Node.js runtime)');
  }
}

// C13 - .env.example (key names only, values are never printed)
if (envText === null) {
  fail("C13", ENV_REL, null, "no .env.example");
} else {
  const keys = new Map();
  envLines.forEach((line, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !/^\s*#/.test(line)) keys.set(m[1], { value: m[2].trim().replace(/^["']|["']$/g, ""), line: i + 1 });
  });
  const required = ["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET", "APP_BASE_URL"];
  const missing = required.filter((k) => !keys.has(k));
  if (missing.length) fail("C13", ENV_REL, null, `missing key(s): ${missing.join(", ")}`);
  for (const [key, { value, line }] of keys) {
    const isSecret = key === "N8N_WEBHOOK_TOKEN" || key === "N8N_CALLBACK_SECRET" || /(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)$/.test(key);
    if (isSecret && !value.startsWith("change-me")) fail("C13", ENV_REL, line, `${key} must be a change-me-... placeholder`);
  }
  const base = keys.get("N8N_WEBHOOK_BASE_URL");
  if (base && !/\/webhook$/.test(base.value)) fail("C13", ENV_REL, base.line, "N8N_WEBHOOK_BASE_URL must end with /webhook");
}

// C14 - logs
for (const f of files) {
  for (const m of matches(f.code, /\bconsole\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(/)) {
    const open = m.index + m[0].length - 1;
    const logged = f.code.slice(open + 1, matchClose(f.code, open));
    const hit =
      /\b(?:formData|rawBody|raw|body|headers|signature|token|secret|password|email|phone)\b/.exec(logged) ??
      /JSON\s*\.\s*stringify|process\s*\.\s*env/.exec(logged);
    if (hit) fail("C14", f.rel, lineOf(f, m.index), `logs "${hit[0].trim()}": log ids, events and codes, not bodies, personal data or secrets`);
  }
}

// ---------------------------------------------------------------------------
// --changed-since
// ---------------------------------------------------------------------------

function git(argv) {
  return execFileSync("git", ["-C", root, "-c", "core.quotepath=false", ...argv], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

let changed = null;
if (args["changed-since"] !== undefined) {
  const ref = args["changed-since"];
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    usageError(`--changed-since: "${ref}" is not a commit in ${root}`);
  }
  changed = new Map();
  let current = null;
  for (const line of git(["diff", "-U0", "--no-color", "--no-ext-diff", ref, "--"]).split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      current = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (current && !changed.has(current)) changed.set(current, { all: false, lines: new Set() });
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const from = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let k = 0; k < count; k++) changed.get(current).lines.add(from + k);
    }
  }
  for (const rel of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
    changed.set(rel, { all: true, lines: new Set() });
  }
}

function inScope({ rel, line }) {
  if (!changed) return true;
  const entry = changed.get(rel);
  if (!entry) return false;
  return entry.all || line === null || entry.lines.has(line);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const scope = changed
  ? `changed since ${args["changed-since"]} (${changed.size} file(s) changed)`
  : "whole project";
console.log(`check-contract (n8n) - root: ${root} - ${scope}`);
let failed = 0;
let passed = 0;
let skipped = 0;
for (const [id, title] of CHECKS) {
  const all = findings.get(id);
  const kept = all.filter(inScope);
  const ignored = all.length - kept.length;
  let status = "PASS";
  if (kept.length) status = "FAIL";
  else if (!all.length && notApplicable.has(id)) status = "N/A";
  const note = status === "N/A" ? ` (${notApplicable.get(id)})` : ignored ? ` (${ignored} finding(s) in unchanged code ignored)` : "";
  console.log(`${id.padEnd(4)} ${status.padEnd(4)}  ${title}${note}`);
  for (const f of kept) console.log(`      ${f.rel}${f.line ? `:${f.line}` : ""} - ${f.message}`);
  if (status === "FAIL") failed++;
  else if (status === "PASS") passed++;
  else skipped++;
}
console.log(`Result: ${passed} PASS, ${failed} FAIL, ${skipped} N/A`);
process.exit(failed ? 1 : 0);
