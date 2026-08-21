import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  accreditationDate: z.string().date(),
  documentPath: z.string().trim().max(500).optional().or(z.literal("")).default(""),
  documentType: z.string().trim().max(80).optional().or(z.literal("")).default(""),
  effectiveFrom: z.string().date().optional().or(z.literal("")).default(""),
  employeeId: z.string().uuid(),
  observation: z.string().trim().max(800).optional().default(""),
  recognizedPreviousServiceYears: z.coerce.number().int().min(0).max(10)
});

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "progressive_vacation_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const body = parsed.data;
  const supabase = createAdminClient();
  const { data: employee } = await supabase
    .from("hr_employees")
    .select("id,tenant_id")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!employee) return NextResponse.json({ ok: false, error: "employee_not_found" }, { status: 404 });

  const { data, error } = await supabase.from("hr_vacation_progressive_records").insert({
    accreditation_date: body.accreditationDate,
    created_by: ctx.user.id,
    document_path: body.documentPath || null,
    document_type: body.documentType || null,
    effective_from: body.effectiveFrom || body.accreditationDate,
    employee_id: body.employeeId,
    previous_employer_years: body.recognizedPreviousServiceYears,
    recognized_days: 0,
    review_notes: body.observation || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: ctx.user.id,
    status: "acreditado",
    tenant_id: ctx.membership.tenant_id
  }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "progressive_vacation_save_failed" }, { status: 422 });

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: {
      accreditationDate: body.accreditationDate,
      documentPath: body.documentPath || null,
      documentType: body.documentType || null,
      effectiveFrom: body.effectiveFrom || body.accreditationDate,
      employeeId: body.employeeId,
      observation: body.observation || null,
      recognizedPreviousServiceYears: body.recognizedPreviousServiceYears
    },
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "hr_vacation_progressive_record",
    event_type: "hr.vacation_progressive_previous_years_recognized",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ id: data.id, ok: true });
}
