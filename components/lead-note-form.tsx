"use client";

import { useActionState, useState } from "react";
import { addLeadNote, type AddLeadNoteState } from "@/app/actions";
import { LEAD_NOTE_MAX_LENGTH } from "@/lib/lead-note-form";

const initialState: AddLeadNoteState = { status: "idle" };

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addLeadNote, initialState);
  // Editing the field hides its old error until the next submission.
  const [editedAfter, setEditedAfter] = useState<AddLeadNoteState | null>(null);
  const errors = state.status === "invalid" && editedAfter !== state ? state.errors : {};
  const values = state.status === "invalid" || state.status === "error" ? state.values : {};

  return (
    // key: React 19 resets the form after the action; remounting with the returned values keeps the note
    <form
      key={`${state.status}:${values.text ?? ""}`}
      action={formAction}
      onChange={() => setEditedAfter(state)}
      className="space-y-2"
      noValidate
    >
      <input type="hidden" name="leadId" value={leadId} />

      {state.status === "invalid" && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          Нотатку не збережено: перевірте поле «Нова нотатка».
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          Не вдалося зберегти нотатку. Оновіть сторінку й спробуйте ще раз — текст нижче збережено.
        </div>
      )}

      <label htmlFor="note-text" className="block font-medium">
        Нова нотатка
      </label>
      <textarea
        id="note-text"
        name="text"
        rows={3}
        required
        maxLength={LEAD_NOTE_MAX_LENGTH}
        defaultValue={values.text ?? ""}
        aria-invalid={errors.text ? true : undefined}
        aria-describedby={errors.text ? "note-text-hint note-text-error" : "note-text-hint"}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 aria-invalid:border-red-500 sm:text-sm"
      />
      <p id="note-text-hint" className="text-xs text-slate-500">
        До {LEAD_NOTE_MAX_LENGTH} символів. Нотатку бачить лише команда.
      </p>
      {errors.text && (
        <p id="note-text-error" className="text-xs text-red-700">
          Помилка: {errors.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Надсилаємо…" : "Додати нотатку"}
        </button>
        <p role="status" className="text-slate-600">
          {state.status === "ok" ? "Нотатку додано." : ""}
        </p>
      </div>
    </form>
  );
}
