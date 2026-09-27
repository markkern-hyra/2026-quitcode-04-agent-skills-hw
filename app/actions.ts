"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import { parseLeadNoteForm, type LeadNoteFormField } from "@/lib/lead-note-form";
import { triggerWorkflow } from "@/lib/n8n/client";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
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
      await triggerWorkflow("lead-created", { leadId: lead.id, source: lead.source }, { idempotencyKey });
    } catch (error) {
      // configuration error, e.g. a missing N8N_* variable
      console.error("n8n.request_failed", { event: "lead-created", error: (error as Error).name });
    }
  });

  await logAudit("lead.created", lead.id);

  return { status: "ok" };
}

// Server Actions are public POST endpoints, not just buttons in our UI: every
// action checks the session and that the lead belongs to the caller's workspace.
async function isOwnLead(id: string) {
  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(id)]);
  return lead !== null && lead.workspaceId === workspace.id;
}

async function requireOwnLead(id: string) {
  if (!(await isOwnLead(id))) {
    throw new Error("Lead not found");
  }
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Unknown lead status");
  }
  await requireOwnLead(id);
  await db.updateLeadStatus(id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
}

export type AddLeadNoteState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Partial<Record<LeadNoteFormField, string>>;
      values: Partial<Record<LeadNoteFormField, string>>;
    }
  | { status: "error" }
  | { status: "ok" };

export async function addLeadNote(
  _prevState: AddLeadNoteState,
  formData: FormData,
): Promise<AddLeadNoteState> {
  const leadId = formData.get("leadId");
  if (typeof leadId !== "string" || !(await isOwnLead(leadId))) {
    return { status: "error" };
  }

  const parsed = parseLeadNoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  try {
    if (!(await db.appendLeadNote(leadId, parsed.data.text))) {
      return { status: "error" };
    }
  } catch (error) {
    console.error("lead.note_add_failed", leadId, error instanceof Error ? error.name : "UnknownError");
    return { status: "error" };
  }

  after(() => logAudit("lead.note_added", leadId));
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { status: "ok" };
}

export async function deleteLead(id: string) {
  await requireOwnLead(id);
  await db.deleteLead(id);
  revalidatePath("/dashboard");
}
