"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestQuote, type RequestQuoteState } from "@/app/quotes/actions";
import { BUDGET_OPTIONS } from "@/lib/lead-form";
import type { QuoteFormField } from "@/lib/quote-form";

const initialState: RequestQuoteState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 aria-invalid:border-red-500 sm:text-sm";

const FIELD_LABELS: Record<QuoteFormField, string> = {
  company: "Компанія",
  email: "Email",
  description: "Опис задачі",
  budget: "Бюджет",
};

export function QuoteForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(requestQuote, initialState);
  // Editing a field hides its old error until the next submission.
  const [edited, setEdited] = useState<{ after: RequestQuoteState; fields: Set<string> } | null>(null);
  const allErrors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" || state.status === "limited" ? state.values : undefined;
  const shown = (field: QuoteFormField) =>
    edited?.after === state && edited.fields.has(field) ? undefined : allErrors[field];
  const a11y = (field: QuoteFormField) => ({
    id: `quote-${field}`,
    "aria-invalid": shown(field) ? true : undefined,
    "aria-describedby": shown(field) ? `quote-${field}-error` : undefined,
  });
  const errorText = (field: QuoteFormField) =>
    shown(field) && (
      <span id={`quote-${field}-error`} className="mt-1 block text-xs text-red-600">
        {shown(field)}
      </span>
    );

  useEffect(() => {
    if (state.status === "ok") router.push(`/quotes/${state.id}`);
  }, [state, router]);

  if (state.status === "ok") {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-lg font-medium">Запит прийнято.</p>
        <p className="text-sm text-slate-600">
          Відкриваємо{" "}
          <Link href={`/quotes/${state.id}`} className="text-indigo-600 underline">
            сторінку статусу
          </Link>
          …
        </p>
      </div>
    );
  }

  const failed = Object.keys(allErrors) as QuoteFormField[];

  return (
    // key: remount with the submitted values after a validation error (React 19 resets the form)
    <form
      key={JSON.stringify(values ?? {})}
      action={formAction}
      onChange={(event) => {
        const name = (event.target as { name?: string }).name ?? "";
        const fields = new Set(edited?.after === state ? edited.fields : []);
        setEdited({ after: state, fields: fields.add(name) });
      }}
      className="space-y-4"
      noValidate
    >
      {failed.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Запит не надіслано. Перевірте поля: {failed.map((field) => `«${FIELD_LABELS[field]}»`).join(", ")}.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {FIELD_LABELS.company}
          <input
            name="company"
            required
            autoComplete="organization"
            defaultValue={values?.company}
            className={inputClass}
            {...a11y("company")}
          />
          {errorText("company")}
        </label>
        <label className="block text-sm font-medium">
          {FIELD_LABELS.email}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={values?.email}
            className={inputClass}
            {...a11y("email")}
          />
          {errorText("email")}
        </label>
      </div>

      <label className="block text-sm font-medium">
        {FIELD_LABELS.description}
        <textarea
          name="description"
          rows={5}
          required
          defaultValue={values?.description}
          className={inputClass}
          {...a11y("description")}
        />
        {errorText("description")}
      </label>

      <label className="block text-sm font-medium">
        {FIELD_LABELS.budget}
        <select name="budget" defaultValue={values?.budget ?? ""} className={inputClass} {...a11y("budget")}>
          {BUDGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errorText("budget")}
      </label>

      {state.status === "limited" && (
        <p role="alert" className="text-sm text-red-600">
          Забагато запитів з вашої адреси. Спробуйте пізніше або напишіть нам напряму.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Отримати кошторис"}
      </button>
    </form>
  );
}
