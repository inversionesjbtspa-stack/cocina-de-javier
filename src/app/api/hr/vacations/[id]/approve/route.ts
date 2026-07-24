import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type VacationRequestApprovalRow = {
  id: string;
  status: string | null;
  tenant_id: string;
  version: number | null;
};

type VacationRequestApprovalResult = {
  data: VacationRequestApprovalRow | null;
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: current }: VacationRequestApprovalResult = await supabase
    .from("hr_vacation_requests")
    .select("id,tenant_id,status,version")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (!current || current.tenant_id !== ctx.membership.tenant_id) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const result = await supabase.rpc("hr_approve_vacation_request", {
    p_request_id: id,
    p_expected_version: Number(current.version ?? 1)
  });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
  return NextResponse.json({ ok: true, result: result.data });
}
