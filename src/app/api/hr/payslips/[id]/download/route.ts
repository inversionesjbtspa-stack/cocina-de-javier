import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("hr_payslips").select("storage_bucket,storage_path,original_filename").eq("tenant_id", ctx.membership.tenant_id).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "payslip_not_found" }, { status: 404 });
  const signed = await supabase.storage.from(data.storage_bucket).createSignedUrl(data.storage_path, 60, { download: data.original_filename });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ ok: false, error: signed.error?.message ?? "signed_url_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { filename: data.original_filename },
    company_id: ctx.membership.company_id,
    entity_id: id,
    entity_type: "hr_payslip",
    event_type: "hr.payslip_downloaded",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.redirect(signed.data.signedUrl);
}
