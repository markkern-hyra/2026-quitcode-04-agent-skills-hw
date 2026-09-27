"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { parseLeadForm, type LeadFormField, type LeadFormValues } from "@/lib/lead-form";
import { parseLeadNoteForm, type LeadNoteFormField } from "@/lib/lead-note-form";
import { triggerWorkflow } from "@/lib/n8n/client";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>>; values: LeadFormValues }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  // An "FYI" event: n8n answers at once and nothing comes back. Still not awaited,
  // so the visitor never waits for n8n (or its retries).
  const idempotencyKey = randomUUID();
  after(async () => {
    try {
      // The minimum: contact details, IP and the raw form stay in LeadDesk.
      const result = await triggerWorkflow("lead-created", { leadId: lead.id, source: lead.source }, { idempotencyKey });
      // Not delivered after the retries: the lead is saved, so this is for a manual resend, not for the visitor.
      if (!result.ok) console.warn("n8n.not_delivered", { event: "lead-created", leadId: lead.id, status: result.status });
    } catch (error) {
      // configuration error, e.g. a missing N8N_* variable
      console.error("n8n.request_failed", { event: "lead-created", leadId: lead.id, error: (error as Error).name });
    }
  });
  after(async () => {
    try {
      await logAudit("lead.created", lead.id);
    } catch (error) {
      console.error("audit.failed", { action: "lead.created", leadId: lead.id, error: (error as Error).name });
    }
  });

  return { status: "ok" };
}

// Server Actions are public POST endpoints, not just buttons in our UI: every
// action checks the session and that the lead belongs to the caller's workspace.
async function isOwnLead(id: string) {
  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(id)]);
  return lead !== null && lead.workspaceId === workspace.id;
}

// What the status and delete buttons get back: nothing from the database, only whether it worked.
// "not_found" covers someone else's lead too, so the answer does not reveal which one it was.
export type LeadMutationResult = { status: "ok" } | { status: "invalid" } | { status: "not_found" };

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<LeadMutationResult> {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) return { status: "invalid" };
  if (!(await isOwnLead(id))) return { status: "not_found" };
  // The lead can be deleted between the check and the write: then nothing was changed.
  if (!(await db.updateLeadStatus(id, status))) return { status: "not_found" };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
  return { status: "ok" };
}

export type AddLeadNoteState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Partial<Record<LeadNoteFormField, string>>;
      values: Partial<Record<LeadNoteFormField, string>>;
    }
  | { status: "error"; values: Partial<Record<LeadNoteFormField, string>> }
  | { status: "ok" };

export async function addLeadNote(
  _prevState: AddLeadNoteState,
  formData: FormData,
): Promise<AddLeadNoteState> {
  // Whatever goes wrong, the typed note comes back so the form can show it again.
  const typed = formData.get("text");
  const values = { text: typeof typed === "string" ? typed : "" };
  const leadId = formData.get("leadId");
  if (typeof leadId !== "string" || !(await isOwnLead(leadId))) {
    return { status: "error", values };
  }

  const parsed = parseLeadNoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  try {
    // false: the lead was deleted after the check, so the note was not saved
    if (!(await db.appendLeadNote(leadId, parsed.data.text))) {
      return { status: "error", values };
    }
  } catch (error) {
    console.error("lead.note_add_failed", { leadId, error: error instanceof Error ? error.name : "UnknownError" });
    return { status: "error", values };
  }

  after(async () => {
    try {
      await logAudit("lead.note_added", leadId);
    } catch (error) {
      console.error("audit.failed", { action: "lead.note_added", leadId, error: (error as Error).name });
    }
  });
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { status: "ok" };
}

export async function deleteLead(id: string): Promise<LeadMutationResult> {
  if (!(await isOwnLead(id))) return { status: "not_found" };
  if (!(await db.deleteLead(id))) return { status: "not_found" };
  revalidatePath("/dashboard");
  return { status: "ok" };
}
