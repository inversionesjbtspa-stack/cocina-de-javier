import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanRut(value: string) {
  return value.replace(/\./g, "").replace(/\s+/g, "").toUpperCase();
}

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager", "accountant"].includes(membership.data.role)) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  }
  return { error: null, membership: membership.data, user };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const rut = cleanRut(String(body.rut ?? ""));
  const supplierName = String(body.supplierName ?? "").trim();
  const documentType = String(body.documentType ?? "manual").trim() || "manual";
  const folio = String(body.folio ?? "").trim();
  const issueDate = String(body.issueDate ?? "").trim();
  const dueDate = String(body.dueDate ?? issueDate).trim();
  const amount = Number(body.amount ?? 0);
  if (!rut || !supplierName || !folio || !issueDate || !dueDate || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "manual_payable_invalid_payload" }, { status: 422 });
  }

  const supabase = createAdminClient();
  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .upsert({
      company_id: ctx.membership.company_id,
      legal_name: supplierName,
      profile_source: "manual",
      rut,
      status: "draft",
      tenant_id: ctx.membership.tenant_id,
      trade_name: supplierName
    }, { onConflict: "tenant_id,rut" })
    .select("id")
    .single();
  if (supplierError || !supplier?.id) return NextResponse.json({ ok: false, error: supplierError?.message ?? "supplier_not_saved" }, { status: 500 });

  const documentNumber = `${documentType}-${folio}`;
  const existing = await supabase
    .from("accounts_payable")
    .select("id")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("supplier_id", supplier.id)
    .eq("document_number", documentNumber)
    .maybeSingle();
  if (existing.data?.id) return NextResponse.json({ ok: true, existing: true, id: existing.data.id });

  const payload = {
    balance_amount: amount,
    company_id: ctx.membership.company_id,
    document_number: documentNumber,
    due_date: dueDate,
    issue_date: issueDate,
    is_payable_without_xml: true,
    payment_status: "pending",
    source_type: "manual",
    status: "pending_approval",
    subtotal: amount,
    supplier_id: supplier.id,
    tax_amount: 0,
    tenant_id: ctx.membership.tenant_id,
    total_amount: amount,
    xml_status: "not_applicable"
  };
  const created = await supabase.from("accounts_payable").insert(payload).select("id").single();
  const fallback = created.error
    ? await supabase.from("accounts_payable").insert({
      balance_amount: amount,
      company_id: ctx.membership.company_id,
      document_number: documentNumber,
      due_date: dueDate,
      issue_date: issueDate,
      status: "pending_approval",
      subtotal: amount,
      supplier_id: supplier.id,
      tax_amount: 0,
      tenant_id: ctx.membership.tenant_id,
      total_amount: amount
    }).select("id").single()
    : null;
  const payable = created.data ?? fallback?.data;
  const error = fallback?.error ?? created.error;
  if (error || !payable?.id) return NextResponse.json({ ok: false, error: error?.message ?? "payable_not_saved" }, { status: 500 });

  await supabase.from("audit_events").insert({
    actor_user_id: ctx.user.id,
    after_data: { amount, document_number: documentNumber, rut, source_type: "manual", supplier_id: supplier.id },
    company_id: ctx.membership.company_id,
    entity_id: payable.id,
    entity_type: "accounts_payable",
    event_type: "accounts_payable.manual_created",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, id: payable.id });
}
