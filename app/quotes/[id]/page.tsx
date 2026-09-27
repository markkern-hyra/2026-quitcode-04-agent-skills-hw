import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshWhileQueued } from "@/components/refresh-while-queued";
import { db } from "@/lib/db";
import { BUDGET_OPTIONS } from "@/lib/lead-form";
import type { QuoteStatus } from "@/lib/types";

// The unguessable id in the URL is the only key to this page: keep it out of search engines.
export const metadata: Metadata = {
  title: "Статус кошторису · Studio Nova",
  robots: { index: false, follow: false },
};

const dateTimeFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });

// The workflow takes 40–90 s; after this the page says it is taking longer than usual.
const SLOW_AFTER_MS = 5 * 60 * 1000;

function isSlow(createdAt: string) {
  return Date.now() - Date.parse(createdAt) > SLOW_AFTER_MS;
}

const STATUS_TEXT: Record<QuoteStatus, { title: string; style: string }> = {
  queued: { title: "Готуємо кошторис…", style: "border-sky-200 bg-sky-50" },
  ready: { title: "Кошторис готовий", style: "border-emerald-200 bg-emerald-50" },
  failed: { title: "Не вдалося підготувати кошторис", style: "border-red-200 bg-red-50" },
};

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const quote = await db.getQuote(id);
  if (!quote) notFound();

  const budget = BUDGET_OPTIONS.find((option) => option.value === String(quote.budget ?? ""))?.label ?? "—";
  const status = STATUS_TEXT[quote.status];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Studio Nova
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Кошторис для {quote.company}</h1>

        <section className={`space-y-2 rounded-xl border p-6 text-sm ${status.style}`} aria-live="polite">
          <h2 className="text-lg font-medium">{status.title}</h2>

          {quote.status === "queued" && (
            <>
              <RefreshWhileQueued />
              <p className="text-slate-600">
                Зазвичай це займає одну-дві хвилини. Сторінка оновиться сама — можна не перезавантажувати.
              </p>
              {isSlow(quote.createdAt) && (
                <p className="text-slate-600">
                  Цього разу довше, ніж зазвичай. Збережіть посилання на сторінку й загляньте пізніше.
                </p>
              )}
            </>
          )}

          {quote.status === "ready" && quote.documentUrl && (
            <a
              href={quote.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Завантажити PDF
            </a>
          )}

          {quote.status === "failed" && (
            <p className="text-slate-600">
              Спробуйте{" "}
              <Link href="/quotes/new" className="text-indigo-600 underline">
                надіслати запит ще раз
              </Link>{" "}
              або напишіть нам — ми підготуємо кошторис вручну.
            </p>
          )}
        </section>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Бюджет</dt>
            <dd className="font-medium">{budget}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Надіслано</dt>
            <dd className="font-medium">{dateTimeFormat.format(new Date(quote.createdAt))}</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
