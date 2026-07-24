import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { getVacationRequestForTenant } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const current = await getVacationRequestForTenant(supabase, ctx.membership.tenant_id, id, "id,tenant_id,status,version");
  if (!current.ok) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const result = await supabase.rpc("hr_approve_vacation_request", {
    p_request_id: id,
    p_expected_version: Number(current.vacation.version ?? 1)
  });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
  return NextResponse.json({ ok: true, result: result.data });
}
