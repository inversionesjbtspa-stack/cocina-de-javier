import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { getVacationRequestForTenant } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().max(800).optional().default("") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "vacation_reject_validation_failed" }, { status: 422 });
  const { id } = await params;
  const supabase = createAdminClient();
  const current = await getVacationRequestForTenant(supabase, ctx.membership.tenant_id, id, "id,tenant_id,status");
  if (!current.ok) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const result = await supabase.rpc("hr_reject_vacation_request", {
    p_reason: parsed.data.reason,
    p_request_id: id
  });
  if (!result.error) return NextResponse.json({ ok: true, result: result.data });
  return NextResponse.json({ ok: false, error: result.error.message }, { status: 422 });
}
