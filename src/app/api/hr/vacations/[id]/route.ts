import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { isCancelledVacationRequest } from "@/lib/hr/vacation-domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  reason: z.string().trim().max(800).optional().default(""),
  status: z.enum(["anulada"])
});

type VacationRequestLookupRow = {
  id: string;
  status: string | null;
  tenant_id: string;
};

type VacationRequestLookupResult = {
  data: VacationRequestLookupRow | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data, error }, allocations, movements] = await Promise.all([
    supabase
      .from("hr_vacation_requests")
      .select("*,hr_employees(id,full_name,rut,position,area,cost_center,hire_date,contract_type)")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("hr_vacation_allocations").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("request_id", id).order("allocation_order", { ascending: true }),
    supabase.from("hr_vacation_movements").select("*").eq("tenant_id", ctx.membership.tenant_id).eq("request_id", id).order("created_at", { ascending: false })
  ]);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  if (!data) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, allocations: allocations.data ?? [], movements: movements.data ?? [], vacation: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_patch_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const { id } = await params;
  const supabase = createAdminClient();
  const authSupabase = await createClient();
  const result = await authSupabase.rpc("hr_cancel_vacation_request", {
    p_reason: parsed.data.reason,
    p_request_id: id
  });
  const { data: current }: VacationRequestLookupResult = await supabase
    .from("hr_vacation_requests")
    .select("id,tenant_id,status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (!current || current.tenant_id !== ctx.membership.tenant_id) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  if (result.error) {
    if (isCancelledVacationRequest(current.status) && result.error.message.includes("vacation_already_cancelled")) {
      return NextResponse.json({ ok: true, result: { already_cancelled: true, status: current.status } });
    }
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
  }
  if (!isCancelledVacationRequest(current.status)) {
    return NextResponse.json({ ok: false, error: "vacation_cancel_not_persisted", status: current.status }, { status: 409 });
  }
  return NextResponse.json({ ok: true, result: { ...(typeof result.data === "object" && result.data ? result.data : {}), status: current.status } });
}
