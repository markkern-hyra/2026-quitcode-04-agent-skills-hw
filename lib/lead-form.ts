export const BUDGET_OPTIONS = [
  { value: "", label: "Ще не визначились" },
  { value: "500", label: "до $500 / міс." },
  { value: "1500", label: "$500–1500 / міс." },
  { value: "5000", label: "$1500–5000 / міс." },
  { value: "10000", label: "понад $5000 / міс." },
] as const;

export type LeadFormField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "company"
  | "website"
  | "budget"
  | "message"
  | "consentMarketing";

export type LeadFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  budget: number | null;
  message: string;
  consentMarketing: boolean;
};

// `values` is what was typed (trimmed, never cut), to show it again if the form comes back.
export type LeadFormValues = Record<LeadFormField, string>;

export type ParseResult =
  | { ok: true; data: LeadFormData }
  | { ok: false; errors: Partial<Record<LeadFormField, string>>; values: LeadFormValues };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export const LEAD_FORM_MAX_LENGTH = {
  firstName: 80,
  lastName: 80,
  email: 200,
  phone: 20,
  company: 120,
  website: 200,
  message: 2000,
} as const;

function text(formData: FormData, name: LeadFormField) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseLeadForm(formData: FormData): ParseResult {
  const values: LeadFormValues = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    company: text(formData, "company"),
    website: text(formData, "website"),
    budget: text(formData, "budget"),
    message: text(formData, "message"),
    consentMarketing: formData.get("consentMarketing") === "on" ? "on" : "",
  };

  const errors: Partial<Record<LeadFormField, string>> = {};

  if (!values.firstName) errors.firstName = "Вкажіть ім'я";
  if (!values.lastName) errors.lastName = "Вкажіть прізвище";
  if (!EMAIL_RE.test(values.email)) errors.email = "Перевірте email";
  if (values.phone && !PHONE_RE.test(values.phone)) errors.phone = "Перевірте номер телефону";
  if (values.message.length < 10) errors.message = "Опишіть задачу хоча б одним реченням";
  if (values.budget && !BUDGET_OPTIONS.some((option) => option.value === values.budget)) {
    errors.budget = "Оберіть бюджет зі списку";
  }
  // Too long is an error, not a silent cut: the value comes back exactly as typed.
  for (const [field, max] of Object.entries(LEAD_FORM_MAX_LENGTH) as [keyof typeof LEAD_FORM_MAX_LENGTH, number][]) {
    if (!errors[field] && values[field].length > max) errors[field] = `До ${max} символів (зараз ${values[field].length})`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  return {
    ok: true,
    data: {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email.toLowerCase(),
      phone: values.phone,
      company: values.company,
      website: values.website,
      budget: values.budget ? Number(values.budget) : null,
      message: values.message,
      consentMarketing: values.consentMarketing === "on",
    },
  };
}
