import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const supplierCreateSchema = z.object({
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
  rut: z.string().trim().regex(/^[0-9]+-[0-9kK]$/, "RUT invalido"),
  status: z.enum(["draft", "active", "blocked", "archived"]),
  tradeName: z.string().trim().max(240)
});

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "procurement_manager"].includes(membership.data.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = supplierCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "supplier_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const duplicate = await supabase.from("suppliers").select("id").eq("tenant_id", membership.data.tenant_id).eq("rut", body.rut).maybeSingle();
  if (duplicate.data) return NextResponse.json({ ok: false, error: "supplier_rut_exists" }, { status: 409 });
  const { data: supplier, error } = await supabase.from("suppliers").insert({
    address: body.address || null,
    category: body.category || null,
    city: body.city || null,
    commercial_email: body.commercialEmail || null,
    commune: body.commune || null,
    company_id: membership.data.company_id,
    email: body.email || body.paymentEmail || null,
    giro: body.giro || null,
    legal_name: body.legalName,
    observations: body.observations || null,
    payment_email: body.paymentEmail || null,
    payment_terms_days: body.paymentTermsDays,
    payment_terms_label: body.paymentTermsLabel || null,
    phone: body.phone || null,
    profile_manual_updated_at: new Date().toISOString(),
    profile_source: "manual",
    rut: body.rut,
    status: body.status,
    tenant_id: membership.data.tenant_id,
    trade_name: body.tradeName || null
  }).select("id,tenant_id,company_id,rut,legal_name").single();
  if (error || !supplier) return NextResponse.json({ ok: false, error: error?.message ?? "supplier_create_failed" }, { status: 422 });
  if (body.contactName) await supabase.from("supplier_contacts").insert({ email: body.commercialEmail || body.email || null, is_primary: true, name: body.contactName, phone: body.phone || null, supplier_id: supplier.id, tenant_id: supplier.tenant_id });
  if (body.bankName && body.accountType && body.accountNumber) await supabase.from("supplier_bank_accounts").insert({ account_holder_name: body.accountHolderName || body.legalName, account_holder_rut: body.accountHolderRut || body.rut, account_number: body.accountNumber, account_type: body.accountType, bank_code: body.bankCode || null, bank_name: body.bankName, status: "pending_validation", supplier_id: supplier.id, tenant_id: supplier.tenant_id });
  await supabase.from("audit_events").insert({ actor_role: membership.data.role, actor_user_id: user.id, after_data: body, company_id: supplier.company_id, entity_id: supplier.id, entity_type: "supplier", event_type: "supplier.created", tenant_id: supplier.tenant_id });
  return NextResponse.json({ ok: true, supplier });
}
