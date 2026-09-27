"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLead, updateLeadStatus, type LeadMutationResult } from "@/app/actions";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { STATUS_LABELS } from "./status-badge";

const FAILURE_TEXT = {
  invalid: "Невідомий статус.",
  not_found: "Лід не знайдено: можливо, його вже видалили. Оновіть сторінку.",
  error: "Не вдалося зберегти зміни. Спробуйте ще раз.",
} as const;

export function LeadActions({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState<LeadStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The action says whether it worked; a rejected call (network, server error) is a failure too.
  async function run(action: () => Promise<LeadMutationResult>): Promise<boolean> {
    try {
      const result = await action();
      if (result.status === "ok") return true;
      setError(FAILURE_TEXT[result.status]);
    } catch {
      setError(FAILURE_TEXT.error);
    }
    return false;
  }

  function changeStatus(next: LeadStatus) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      if (await run(() => updateLeadStatus(leadId, next))) router.refresh();
      else setCurrent(previous);
    });
  }

  function remove() {
    if (!window.confirm("Видалити лід назавжди?")) return;
    setError(null);
    startTransition(async () => {
      if (await run(() => deleteLead(leadId))) router.push("/dashboard");
    });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
      <label className="text-sm font-medium">
        Статус
        <select
          value={current}
          disabled={pending}
          onChange={(event) => changeStatus(event.target.value as LeadStatus)}
          className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        Видалити лід
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
