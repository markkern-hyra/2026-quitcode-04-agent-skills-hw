"use client";

import { useActionState, useState } from "react";
import { submitLead, type SubmitLeadState } from "@/app/actions";
import { BUDGET_OPTIONS, type LeadFormField } from "@/lib/lead-form";

const initialState: SubmitLeadState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 aria-invalid:border-red-500 sm:text-sm";

const FIELD_LABELS: Record<LeadFormField, string> = {
  firstName: "Ім'я",
  lastName: "Прізвище",
  email: "Email",
  phone: "Телефон",
  company: "Компанія",
  website: "Сайт",
  budget: "Бюджет",
  message: "Що потрібно зробити?",
  consentMarketing: "Згода на розсилку",
};

export function LeadForm() {
  const [state, formAction, pending] = useActionState(submitLead, initialState);
  // Editing a field hides its old error until the next submission.
  const [edited, setEdited] = useState<{ after: SubmitLeadState; fields: Set<string> } | null>(null);
  const allErrors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" ? state.values : undefined;
  const shown = (field: LeadFormField) =>
    edited?.after === state && edited.fields.has(field) ? undefined : allErrors[field];
  const a11y = (field: LeadFormField) => ({
    id: `lead-${field}`,
    "aria-invalid": shown(field) ? true : undefined,
    "aria-describedby": shown(field) ? `lead-${field}-error` : undefined,
  });
  const errorText = (field: LeadFormField) =>
    shown(field) && (
      <span id={`lead-${field}-error`} className="mt-1 block text-xs text-red-600">
        {shown(field)}
      </span>
    );

  if (state.status === "ok") {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-lg font-medium">Дякуємо! Заявку отримано.</p>
        <p className="text-sm text-slate-600">Ми зв&apos;яжемося з вами протягом робочого дня.</p>
      </div>
    );
  }

  const failed = Object.keys(allErrors) as LeadFormField[];

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
          Заявку не надіслано. Перевірте поля: {failed.map((field) => `«${FIELD_LABELS[field]}»`).join(", ")}.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {FIELD_LABELS.firstName}
          <input
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={values?.firstName}
            className={inputClass}
            {...a11y("firstName")}
          />
          {errorText("firstName")}
        </label>
        <label className="block text-sm font-medium">
          {FIELD_LABELS.lastName}
          <input
            name="lastName"
            required
            autoComplete="family-name"
            defaultValue={values?.lastName}
            className={inputClass}
            {...a11y("lastName")}
          />
          {errorText("lastName")}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="block text-sm font-medium">
          {FIELD_LABELS.phone}
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={values?.phone}
            className={inputClass}
            {...a11y("phone")}
          />
          {errorText("phone")}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {FIELD_LABELS.company}
          <input
            name="company"
            autoComplete="organization"
            defaultValue={values?.company}
            className={inputClass}
            {...a11y("company")}
          />
          {errorText("company")}
        </label>
        <label className="block text-sm font-medium">
          {FIELD_LABELS.website}
          <input
            name="website"
            type="url"
            placeholder="https://"
            defaultValue={values?.website}
            className={inputClass}
            {...a11y("website")}
          />
          {errorText("website")}
        </label>
      </div>

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

      <label className="block text-sm font-medium">
        {FIELD_LABELS.message}
        <textarea
          name="message"
          rows={4}
          required
          defaultValue={values?.message}
          className={inputClass}
          {...a11y("message")}
        />
        {errorText("message")}
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          name="consentMarketing"
          type="checkbox"
          defaultChecked={values?.consentMarketing === "on"}
          className="h-4 w-4 rounded border-slate-300"
        />
        Хочу отримувати корисні матеріали від Studio Nova
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Надіслати заявку"}
      </button>
    </form>
  );
}
