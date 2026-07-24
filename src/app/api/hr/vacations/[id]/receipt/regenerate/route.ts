import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type VacationRequestRegenerateRow = {
  document_number: string | null;
  id: string;
  receipt_snapshot: unknown;
  snapshot: unknown;
  status: string | null;
  tenant_id: string;
};

type VacationRequestRegenerateResult = {
  data: VacationRequestRegenerateRow | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const url = new URL(request.url);
  const baseUrl = `${url.origin}/api/hr/vacations/${id}/papeleta?format=pdf&persist=1`;
  const supabase = createAdminClient();
  const { data: vacation }: VacationRequestRegenerateResult = await supabase
    .from("hr_vacation_requests")
    .select("id,tenant_id,status,document_number,receipt_snapshot,snapshot")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (!vacation || vacation.tenant_id !== ctx.membership.tenant_id) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  if (vacation.status !== "aprobada") return NextResponse.json({ ok: false, error: "vacation_not_approved" }, { status: 422 });
  await supabase.from("hr_vacation_requests").update({ document_generation_status: "retry_requested" }).eq("tenant_id", ctx.membership.tenant_id).eq("id", id);
  return NextResponse.json({ ok: true, receiptUrl: baseUrl });
}
