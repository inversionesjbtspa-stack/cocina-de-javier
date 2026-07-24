import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { getVacationRequestForTenant } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const url = new URL(request.url);
  const baseUrl = `${url.origin}/api/hr/vacations/${id}/papeleta?format=pdf&persist=1`;
  const supabase = createAdminClient();
  const vacation = await getVacationRequestForTenant(supabase, ctx.membership.tenant_id, id, "id,tenant_id,status,document_number,receipt_snapshot,snapshot");
  if (!vacation.ok) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  if (vacation.vacation.status !== "aprobada") return NextResponse.json({ ok: false, error: "vacation_not_approved" }, { status: 422 });
  await supabase.from("hr_vacation_requests").update({ document_generation_status: "retry_requested" }).eq("tenant_id", ctx.membership.tenant_id).eq("id", id);
  return NextResponse.json({ ok: true, receiptUrl: baseUrl });
}
