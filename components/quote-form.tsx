"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestQuote, type RequestQuoteState } from "@/app/quotes/actions";
import { BUDGET_OPTIONS } from "@/lib/lead-form";

const initialState: RequestQuoteState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function QuoteForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(requestQuote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" || state.status === "limited" ? state.values : undefined;

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

  return (
    // key: remount with the submitted values after a validation error
    <form key={JSON.stringify(values ?? {})} action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Компанія
          <input name="company" autoComplete="organization" defaultValue={values?.company} className={inputClass} />
          {errors.company && <span className="mt-1 block text-xs text-red-600">{errors.company}</span>}
        </label>
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" autoComplete="email" defaultValue={values?.email} className={inputClass} />
          {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email}</span>}
        </label>
      </div>

      <label className="block text-sm font-medium">
        Опис задачі
        <textarea name="description" rows={5} defaultValue={values?.description} className={inputClass} />
        {errors.description && <span className="mt-1 block text-xs text-red-600">{errors.description}</span>}
      </label>

      <label className="block text-sm font-medium">
        Бюджет
        <select name="budget" defaultValue={values?.budget ?? ""} className={inputClass}>
          {BUDGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.budget && <span className="mt-1 block text-xs text-red-600">{errors.budget}</span>}
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
