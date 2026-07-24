import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { getVacationRequestForTenant } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const vacation = await getVacationRequestForTenant(supabase, ctx.membership.tenant_id, id, "id,tenant_id,employee_id,status");
  if (!vacation.ok) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const { data: document, error } = await supabase
    .from("hr_vacation_documents")
    .select("id,storage_bucket,storage_path,file_sha256,mime_type,file_size,generated_at,document_status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("vacation_request_id", id)
    .eq("document_type", "comprobante_feriado")
    .neq("document_status", "anulado")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  if (!document?.storage_bucket || !document.storage_path) {
    return NextResponse.json({ ok: false, error: "vacation_receipt_not_generated" }, { status: 404 });
  }
  const signed = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 600);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ ok: false, error: signed.error?.message ?? "signed_url_failed" }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    document: {
      documentStatus: document.document_status,
      fileSha256: document.file_sha256,
      fileSize: document.file_size,
      generatedAt: document.generated_at,
      mimeType: document.mime_type
    },
    expiresInSeconds: 600,
    signedUrl: signed.data.signedUrl
  });
}
