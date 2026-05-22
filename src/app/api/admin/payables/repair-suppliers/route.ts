import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PayableRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  supplier_id: string;
  suppliers: { rut: string; legal_name: string } | Array<{ rut: string; legal_name: string }> | null;
  dte_documents: { id: string; supplier_id: string | null; rut_emisor: string | null; razon_social_emisor: string | null; giro_emisor: string | null; direccion_emisor: string | null } | Array<{ id: string; supplier_id: string | null; rut_emisor: string | null; razon_social_emisor: string | null; giro_emisor: string | null; direccion_emisor: string | null }> | null;
};

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function POST() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager"].includes(membership.data.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("accounts_payable").select("id,tenant_id,company_id,supplier_id,suppliers(rut,legal_name),dte_documents(id,supplier_id,rut_emisor,razon_social_emisor,giro_emisor,direccion_emisor)").eq("tenant_id", membership.data.tenant_id).limit(2500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let relinked = 0;
  let created = 0;
  let reviewed = 0;
  const changes: Array<{ payableId: string; from: string; to: string; rut: string }> = [];
  for (const row of (data ?? []) as PayableRow[]) {
    reviewed += 1;
    const dte = one(row.dte_documents);
    const current = one(row.suppliers);
    const rut = dte?.rut_emisor?.trim();
    if (!dte || !rut) continue;
    let supplierId = dte.supplier_id;
    if (!supplierId) {
      const existing = await supabase.from("suppliers").select("id").eq("tenant_id", row.tenant_id).eq("rut", rut).maybeSingle();
      supplierId = existing.data?.id ?? null;
    }
    if (!supplierId) {
      const inserted = await supabase.from("suppliers").insert({ address: dte.direccion_emisor || null, company_id: row.company_id, giro: dte.giro_emisor || null, legal_name: dte.razon_social_emisor || "Proveedor desde XML", profile_source: "xml", rut, status: "draft", tenant_id: row.tenant_id }).select("id").single();
      supplierId = inserted.data?.id ?? null;
      if (supplierId) { created += 1; await supabase.from("dte_documents").update({ supplier_id: supplierId }).eq("id", dte.id); }
    }
    const currentRutMatches = current?.rut === rut;
    if (supplierId && row.supplier_id !== supplierId && !currentRutMatches) {
      const updated = await supabase.from("accounts_payable").update({ supplier_id: supplierId }).eq("id", row.id);
      if (!updated.error) {
        relinked += 1;
        changes.push({ from: row.supplier_id, payableId: row.id, rut, to: supplierId });
      }
    }
  }
  await supabase.from("audit_events").insert({ actor_role: membership.data.role, actor_user_id: user.id, after_data: { changes, created, relinked, reviewed }, company_id: membership.data.company_id, entity_type: "accounts_payable", event_type: "accounts_payable.suppliers_repaired", tenant_id: membership.data.tenant_id });
  return NextResponse.json({ ok: true, reviewed, relinked, created });
}
