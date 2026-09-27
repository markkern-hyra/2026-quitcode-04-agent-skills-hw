import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_WINDOW_SECONDS = 300;

export function isFreshTimestamp(timestamp: string | null, now = Date.now()): timestamp is string {
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  return Math.abs(Math.floor(now / 1000) - Number(timestamp)) <= SIGNATURE_WINDOW_SECONDS;
}

// The callback secret, unless it is missing, the .env.example placeholder or too short:
// anyone could sign a callback with those.
export function usableCallbackSecret(): string | null {
  const secret = process.env.N8N_CALLBACK_SECRET;
  return secret && !secret.startsWith("change-me") && secret.length >= 32 ? secret : null;
}

// HMAC-SHA256(N8N_CALLBACK_SECRET, "<timestamp>.<raw body>"), header value "sha256=<hex>".
export function isValidSignature(rawBody: string, timestamp: string, header: string | null): boolean {
  const secret = usableCallbackSecret();
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const given = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
