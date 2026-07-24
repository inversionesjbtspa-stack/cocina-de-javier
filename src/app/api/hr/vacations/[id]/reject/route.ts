import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().max(800).optional().default("") });

type VacationRequestLookupRow = {
  id: string;
  status: string | null;
  tenant_id: string;
};

type VacationRequestLookupResult = {
  data: VacationRequestLookupRow | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_reject_validation_failed" }, { status: 422 });
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: current }: VacationRequestLookupResult = await supabase
    .from("hr_vacation_requests")
    .select("id,tenant_id,status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (!current || current.tenant_id !== ctx.membership.tenant_id) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const result = await supabase.rpc("hr_reject_vacation_request", {
    p_reason: parsed.data.reason,
    p_request_id: id
  });
  if (!result.error) return NextResponse.json({ ok: true, result: result.data });
  return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
}
