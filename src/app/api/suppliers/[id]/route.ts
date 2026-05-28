import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const supplierUpdateSchema = z.object({
  accountNumber: z.string().trim().max(80),
  accountType: z.string().trim().max(80),
  accountHolderName: z.string().trim().max(240).optional().default(""),
  accountHolderRut: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(240),
  bankCode: z.string().trim().max(40),
  bankName: z.string().trim().max(160),
  category: z.string().trim().max(120),
  city: z.string().trim().max(120),
  commercialEmail: z.string().trim().email().or(z.literal("")),
  commune: z.string().trim().max(120),
  contactName: z.string().trim().max(160),
  email: z.string().trim().email().or(z.literal("")),
  giro: z.string().trim().max(240),
  legalName: z.string().trim().min(2).max(240),
  observations: z.string().trim().max(1000),
  paymentEmail: z.string().trim().email().or(z.literal("")),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  paymentTermsLabel: z.string().trim().max(120),
  phone: z.string().trim().max(80),
  status: z.enum(["draft", "active", "blocked", "archived"]),
  tradeName: z.string().trim().max(240)
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = supplierUpdateSchema.parse(await request.json());
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: before, error } = await supabase.from("suppliers").select("*,supplier_bank_accounts(*)").eq("id", id).single();
  if (error || !before) return NextResponse.json({ ok: false, error: "supplier_not_found" }, { status: 404 });
  const { data: supplier, error: updateError } = await supabase.from("suppliers").update({
    address: body.address || null, category: body.category || null, city: body.city || null,
    commercial_email: body.commercialEmail || null, commune: body.commune || null, email: body.email || body.paymentEmail || null,
    giro: body.giro || null, legal_name: body.legalName, observations: body.observations || null,
    payment_email: body.paymentEmail || null, payment_terms_days: body.paymentTermsDays, payment_terms_label: body.paymentTermsLabel || null,
    phone: body.phone || null, profile_manual_updated_at: new Date().toISOString(), profile_source: "manual", status: body.status,
    trade_name: body.tradeName || null
  }).eq("id", id).select("id,tenant_id,company_id,rut,legal_name").single();
  if (updateError || !supplier) return NextResponse.json({ ok: false, error: updateError?.message }, { status: 422 });
  if (body.contactName) {
    const { data: primaryContact } = await supabase.from("supplier_contacts").select("id").eq("supplier_id", id).eq("is_primary", true).maybeSingle();
    const contactPayload = { is_primary: true, name: body.contactName, phone: body.phone || null, email: body.commercialEmail || body.email || null };
    if (primaryContact) await supabase.from("supplier_contacts").update(contactPayload).eq("id", primaryContact.id);
    else await supabase.from("supplier_contacts").insert({ ...contactPayload, supplier_id: id, tenant_id: supplier.tenant_id });
  }
  const bankAccounts = before.supplier_bank_accounts as Array<{ id: string }> | undefined;
  if (body.bankName && body.accountType && body.accountNumber) {
    const bankPayload = { account_holder_name: body.accountHolderName || body.legalName, account_holder_rut: body.accountHolderRut || supplier.rut, account_number: body.accountNumber, account_type: body.accountType, bank_code: body.bankCode || null, bank_name: body.bankName, status: "pending_validation", supplier_id: id, tenant_id: supplier.tenant_id };
    if (bankAccounts?.[0]) await supabase.from("supplier_bank_accounts").update(bankPayload).eq("id", bankAccounts[0].id);
    else await supabase.from("supplier_bank_accounts").insert(bankPayload);
  }
  await supabase.from("audit_events").insert({ after_data: body, before_data: before, company_id: supplier.company_id, entity_id: id, entity_type: "supplier", event_type: "supplier.profile_updated", tenant_id: supplier.tenant_id, actor_user_id: user.id });
  return NextResponse.json({ ok: true, supplier });
}
