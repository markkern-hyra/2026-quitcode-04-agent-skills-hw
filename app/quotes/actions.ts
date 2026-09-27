"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { triggerWorkflow } from "@/lib/n8n/client";
import { parseQuoteForm, type QuoteFormField, type QuoteFormValues } from "@/lib/quote-form";
import { markQuoteFailed } from "@/lib/quotes";
import { takeToken } from "@/lib/rate-limit";

// Every accepted request starts a costly workflow (a PDF), and the form is public.
const QUOTES_PER_IP = 5;
const QUOTE_WINDOW_MS = 60 * 60 * 1000;

export type RequestQuoteState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<QuoteFormField, string>>; values: QuoteFormValues }
  | { status: "limited"; values: QuoteFormValues }
  | { status: "ok"; id: string };

// A public form, like submitLead: there is no session to check, but a Server Action
// is still a public POST endpoint, so all input is validated here.
export async function requestQuote(
  _prevState: RequestQuoteState,
  formData: FormData,
): Promise<RequestQuoteState> {
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  // The first x-forwarded-for entry is the client only behind a proxy that sets the
  // header (Vercel does); elsewhere a client can forge it.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!takeToken(`quote:${ip}`, QUOTES_PER_IP, QUOTE_WINDOW_MS)) {
    return { status: "limited", values: parsed.values };
  }

  const quote = await db.insertQuote(parsed.data);

  // The workflow runs 40–90 s, so it is asynchronous: n8n answers 202 at once and
  // reports the PDF to /api/n8n/quote-request. Even the 202 (with retries) is not
  // awaited here — actions of one client run one at a time.
  after(async () => {
    try {
      const result = await triggerWorkflow(
        "quote-request",
        // The minimum the workflow needs: no email, no request metadata.
        { quoteId: quote.id, company: quote.company, budget: quote.budget, description: quote.description },
        { idempotencyKey: quote.requestKey, correlationId: quote.correlationId, callback: true },
      );
      if (result.ok) return;
    } catch (error) {
      // configuration error, e.g. a missing N8N_* variable
      console.error("n8n.request_failed", {
        event: "quote-request",
        correlationId: quote.correlationId,
        error: (error as Error).name,
      });
    }
    await markQuoteFailed(quote.id);
  });

  return { status: "ok", id: quote.id };
}
