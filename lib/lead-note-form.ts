export const LEAD_NOTE_MAX_LENGTH = 500;

export type LeadNoteFormField = "text";

export type LeadNoteFormData = {
  text: string;
};

export type LeadNoteParseResult =
  | { ok: true; data: LeadNoteFormData }
  | {
      ok: false;
      errors: Partial<Record<LeadNoteFormField, string>>;
      values: Partial<Record<LeadNoteFormField, string>>;
    };

export function parseLeadNoteForm(formData: FormData): LeadNoteParseResult {
  const raw = formData.get("text");
  // Form submission sends textarea line breaks as CRLF, while the browser's
  // maxLength counts them as one character: normalize before measuring.
  const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";

  const errors: Partial<Record<LeadNoteFormField, string>> = {};

  if (!text) errors.text = "Напишіть текст нотатки";
  else if (text.length > LEAD_NOTE_MAX_LENGTH) {
    errors.text = `Нотатка задовга: до ${LEAD_NOTE_MAX_LENGTH} символів (зараз ${text.length})`;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors, values: { text } } : { ok: true, data: { text } };
}
