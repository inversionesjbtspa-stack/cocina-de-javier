import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager"].includes(membership.data.role)) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  }
  return { error: null, membership: membership.data, user };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const paidAt = new Date().toISOString();
  const { data: payable, error } = await supabase
    .from("accounts_payable")
    .update({
      balance_amount: 0,
      paid_at: paidAt,
      paid_by: ctx.user.id,
      payment_status: "paid",
      status: "paid"
    })
    .eq("id", id)
    .eq("tenant_id", ctx.membership.tenant_id)
    .select("id,dte_document_id,sii_purchase_registry_id,source_type,xml_status")
    .single();
  if (error || !payable) return NextResponse.json({ ok: false, error: error?.message ?? "payable_not_found" }, { status: 404 });

  if (payable.dte_document_id) {
    await supabase.from("dte_documents").update({ payment_status: "paid" }).eq("id", payable.dte_document_id);
  }
  if (payable.sii_purchase_registry_id) {
    await supabase.from("sii_purchase_registry").update({
      paid_at: paidAt,
      paid_by: ctx.user.id,
      payment_status: "paid"
    }).eq("id", payable.sii_purchase_registry_id);
  }
  await supabase.from("audit_events").insert({
    actor_user_id: ctx.user.id,
    after_data: {
      accounts_payable_id: payable.id,
      dte_document_id: payable.dte_document_id,
      paid_at: paidAt,
      sii_purchase_registry_id: payable.sii_purchase_registry_id,
      xml_status: payable.xml_status
    },
    company_id: ctx.membership.company_id,
    entity_id: payable.id,
    entity_type: "accounts_payable",
    event_type: payable.xml_status === "missing" ? "sii.invoice_paid_without_xml" : "accounts_payable.paid",
    tenant_id: ctx.membership.tenant_id
  });

  return NextResponse.json({ ok: true, paidAt });
}
