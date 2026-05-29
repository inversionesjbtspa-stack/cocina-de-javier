import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { suppliersMaster, supplierByRut, type MasterSupplier } from "@/lib/suppliers/master";

const roles = ["owner", "admin", "finance_manager", "procurement_manager"];

type SupplierRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  rut: string;
  legal_name: string;
  trade_name: string | null;
  giro: string | null;
  commune: string | null;
  city: string | null;
  commercial_email: string | null;
  email: string | null;
  payment_email: string | null;
  phone: string | null;
  observations: string | null;
  profile_source: string | null;
  supplier_bank_accounts?: Array<{
    id: string;
    bank_name: string | null;
    bank_code: string | null;
    account_type: string | null;
    account_number: string | null;
    account_holder_name: string | null;
    account_holder_rut: string | null;
    status: string | null;
  }>;
  supplier_contacts?: Array<{ id: string; name: string | null; is_primary: boolean | null }>;
};

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !roles.includes(membership.data.role)) return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  return { error: null, membership: membership.data, user };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function value(value: unknown) {
  const text = clean(value);
  return text.length ? text : null;
}

function token(value: unknown) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9K]/g, "");
}

function masterForSupplier(supplier: SupplierRow): MasterSupplier | null {
  const byRut = supplierByRut(supplier.rut);
  if (byRut) return byRut;
  const supplierTokens = [supplier.legal_name, supplier.trade_name].map(token).filter(Boolean);
  return suppliersMaster.suppliers.find((master) => {
    const masterTokens = [master.code, master.businessName, master.tradeName].map(token).filter(Boolean);
    return supplierTokens.some((supplierToken) => masterTokens.some((masterToken) => supplierToken.includes(masterToken) || masterToken.includes(supplierToken)));
  }) ?? null;
}

function change(label: string, field: string, current: unknown, next: unknown, source: string) {
  const nextValue = value(next);
  if (clean(current) || !nextValue) return null;
  return { field, label, next: nextValue, source };
}

async function buildPreview(id: string, tenantId: string, supabase: ReturnType<typeof createAdminClient>) {
  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("id,tenant_id,company_id,rut,legal_name,trade_name,giro,commune,city,commercial_email,email,payment_email,phone,observations,profile_source,supplier_contacts(id,name,is_primary),supplier_bank_accounts(id,bank_name,bank_code,account_type,account_number,account_holder_name,account_holder_rut,status)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !supplier) return { error: "supplier_not_found" as const, preview: null, supplier: null };
  const row = supplier as SupplierRow;
  const master = masterForSupplier(row);
  const { data: beneficiaries } = await supabase
    .from("payment_beneficiaries")
    .select("name,rut,bank_name,bank_code,account_type,account_number,payment_email,observation,status")
    .eq("tenant_id", tenantId)
    .eq("rut", row.rut)
    .limit(5);
  const beneficiary = (beneficiaries ?? []).find((item) => item.status === "active") ?? beneficiaries?.[0] ?? null;
  const bank = row.supplier_bank_accounts?.find((item) => item.status !== "disabled") ?? row.supplier_bank_accounts?.[0] ?? null;
  const contact = row.supplier_contacts?.find((item) => item.is_primary) ?? row.supplier_contacts?.[0] ?? null;
  const masterSource = "Maestro Proveedores JESUS";
  const beneficiarySource = "Beneficiarios de pago";
  const masterRecord = (master ?? {}) as Record<string, unknown>;
  const supplierChanges = [
    change("Email pagos", "payment_email", row.payment_email, master?.email || beneficiary?.payment_email, master?.email ? masterSource : beneficiarySource),
    change("Email comercial", "commercial_email", row.commercial_email, master?.email || beneficiary?.payment_email, master?.email ? masterSource : beneficiarySource),
    change("Email general", "email", row.email, master?.email || beneficiary?.payment_email, master?.email ? masterSource : beneficiarySource),
    change("Telefono", "phone", row.phone, master?.phone, masterSource),
    change("Giro", "giro", row.giro, masterRecord.giro || masterRecord.businessActivity || masterRecord.activity, masterSource),
    change("Comuna", "commune", row.commune, masterRecord.commune || masterRecord.comuna, masterSource),
    change("Ciudad", "city", row.city, masterRecord.city || masterRecord.ciudad, masterSource),
    change("Nombre comercial", "trade_name", row.trade_name, master?.tradeName, masterSource),
    change("Observaciones", "observations", row.observations, master?.observations || beneficiary?.observation, master?.observations ? masterSource : beneficiarySource)
  ].filter(Boolean);
  const bankChanges = [
    change("Banco", "bank_name", bank?.bank_name, master?.bankName || beneficiary?.bank_name, master?.bankName ? masterSource : beneficiarySource),
    change("Codigo banco", "bank_code", bank?.bank_code, master?.bankCode || beneficiary?.bank_code, master?.bankCode ? masterSource : beneficiarySource),
    change("Tipo cuenta", "account_type", bank?.account_type, master?.accountType || beneficiary?.account_type || "no_informada_master", master?.accountType ? masterSource : beneficiarySource),
    change("Numero cuenta", "account_number", bank?.account_number, master?.bankAccount || beneficiary?.account_number, master?.bankAccount ? masterSource : beneficiarySource),
    change("Beneficiario cuenta", "account_holder_name", bank?.account_holder_name, master?.businessName || beneficiary?.name || row.legal_name, master?.businessName ? masterSource : beneficiarySource),
    change("RUT beneficiario cuenta", "account_holder_rut", bank?.account_holder_rut, master?.rut || beneficiary?.rut || row.rut, master?.rut ? masterSource : beneficiarySource)
  ].filter(Boolean);
  const contactChanges = [
    change("Contacto", "name", contact?.name, master?.businessName || row.legal_name, masterSource)
  ].filter(Boolean);
  return {
    error: null,
    preview: {
      bankAccountId: bank?.id ?? null,
      bankChanges,
      contactChanges,
      contactId: contact?.id ?? null,
      hasMaster: Boolean(master),
      hasPaymentBeneficiary: Boolean(beneficiary),
      supplierChanges
    },
    supplier: row
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const result = await buildPreview(id, ctx.membership.tenant_id, supabase);
  if (result.error) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, preview: result.preview });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const result = await buildPreview(id, ctx.membership.tenant_id, supabase);
  if (result.error || !result.supplier || !result.preview) return NextResponse.json({ ok: false, error: result.error ?? "supplier_not_found" }, { status: 404 });
  const supplierPatch = Object.fromEntries(result.preview.supplierChanges.map((item) => [item!.field, item!.next]));
  if (Object.keys(supplierPatch).length) {
    await supabase.from("suppliers").update({ ...supplierPatch, profile_source: result.preview.hasMaster ? "master proveedores jesus" : result.supplier.profile_source }).eq("id", id);
  }
  const bankPatch = Object.fromEntries(result.preview.bankChanges.map((item) => [item!.field, item!.next]));
  if (Object.keys(bankPatch).length) {
    if (result.preview.bankAccountId) {
      await supabase.from("supplier_bank_accounts").update(bankPatch).eq("id", result.preview.bankAccountId);
    } else if (bankPatch.bank_name && bankPatch.account_number) {
      await supabase.from("supplier_bank_accounts").insert({ ...bankPatch, status: "pending_validation", supplier_id: id, tenant_id: result.supplier.tenant_id });
    }
  }
  const contactPatch = Object.fromEntries(result.preview.contactChanges.map((item) => [item!.field, item!.next]));
  if (Object.keys(contactPatch).length) {
    if (result.preview.contactId) await supabase.from("supplier_contacts").update(contactPatch).eq("id", result.preview.contactId);
    else await supabase.from("supplier_contacts").insert({ ...contactPatch, is_primary: true, supplier_id: id, tenant_id: result.supplier.tenant_id });
  }
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: result.preview,
    company_id: result.supplier.company_id,
    entity_id: id,
    entity_type: "supplier",
    event_type: "supplier.completed_from_master",
    tenant_id: result.supplier.tenant_id
  });
  return NextResponse.json({ applied: result.preview, ok: true });
}
