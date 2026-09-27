import { BUDGET_OPTIONS } from "./lead-form";

export type QuoteFormField = "company" | "email" | "description" | "budget";

export type QuoteFormValues = Record<QuoteFormField, string>;

export type QuoteFormData = {
  company: string;
  email: string;
  description: string;
  budget: number | null;
};

// `values` is what was typed (trimmed, never cut), to show it again if the form comes back.
export type QuoteParseResult =
  | { ok: true; data: QuoteFormData; values: QuoteFormValues }
  | { ok: false; errors: Partial<Record<QuoteFormField, string>>; values: QuoteFormValues };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const QUOTE_FORM_MAX_LENGTH = { company: 120, email: 200, description: 2000 } as const;

function text(formData: FormData, name: QuoteFormField) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseQuoteForm(formData: FormData): QuoteParseResult {
  const values: QuoteFormValues = {
    company: text(formData, "company"),
    email: text(formData, "email"),
    description: text(formData, "description"),
    budget: text(formData, "budget"),
  };

  const errors: Partial<Record<QuoteFormField, string>> = {};

  if (!values.company) errors.company = "Вкажіть компанію";
  if (!EMAIL_RE.test(values.email)) errors.email = "Перевірте email";
  if (values.description.length < 10) errors.description = "Опишіть задачу хоча б одним реченням";
  if (values.budget && !BUDGET_OPTIONS.some((option) => option.value === values.budget)) {
    errors.budget = "Оберіть бюджет зі списку";
  }
  // Too long is an error, not a silent cut: the value comes back exactly as typed.
  for (const [field, max] of Object.entries(QUOTE_FORM_MAX_LENGTH) as [keyof typeof QUOTE_FORM_MAX_LENGTH, number][]) {
    if (!errors[field] && values[field].length > max) errors[field] = `До ${max} символів (зараз ${values[field].length})`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  return {
    ok: true,
    values,
    data: {
      company: values.company,
      email: values.email.toLowerCase(),
      description: values.description,
      budget: values.budget ? Number(values.budget) : null,
    },
  };
}
