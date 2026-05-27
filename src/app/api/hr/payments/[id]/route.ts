import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  status: z.enum(["borrador", "pendiente_aprobacion", "aprobado", "incluido_en_nomina", "pagado", "anulado"]),
  paymentDate: z.string().date().optional().or(z.literal("")).default("")
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "hr_payment_status_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const update = {
    approved_at: body.status === "aprobado" ? new Date().toISOString() : undefined,
    approved_by: body.status === "aprobado" ? ctx.user.id : undefined,
    payment_date: body.status === "pagado" ? body.paymentDate || new Date().toISOString().slice(0, 10) : undefined,
    status: body.status
  };
  const { data, error } = await supabase
    .from("hr_payment_items")
    .update(update)
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "hr_payment_update_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: body,
    company_id: ctx.membership.company_id,
    entity_id: id,
    entity_type: "hr_payment_item",
    event_type: "hr.payment_item_status_updated",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, payment: data });
}
