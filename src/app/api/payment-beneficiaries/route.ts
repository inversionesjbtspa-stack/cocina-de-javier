import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { candidateFromBeneficiary, candidateFromSupplier, masterCandidates, mergeCandidates } from "@/lib/suppliers/payment-beneficiary-candidates";

const beneficiarySchema = z.object({
  accountNumber: z.string().trim().min(3).max(80),
  accountType: z.string().trim().min(2).max(80),
  bankCode: z.string().trim().min(1).max(40),
  bankName: z.string().trim().min(2).max(160),
  name: z.string().trim().min(2).max(240),
  observation: z.string().trim().max(1000).optional().default(""),
  paymentEmail: z.string().trim().email().or(z.literal("")),
  rut: z.string().trim().regex(/^[0-9]+-[0-9kK]$/, "RUT invalido"),
  status: z.enum(["active", "inactive"]).default("active")
});

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager", "procurement_manager"].includes(membership.data.role)) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  }
  return { error: null, membership: membership.data, user };
}

function toApi(row: Record<string, unknown>) {
  return candidateFromBeneficiary(row);
}

function toDbPayload(body: z.infer<typeof beneficiarySchema>, tenantId: string, userId: string) {
  return {
    account_number: body.accountNumber,
    account_type: body.accountType,
    bank_code: body.bankCode,
    bank_name: body.bankName,
    created_by: userId,
    name: body.name,
    observation: body.observation || null,
    payment_email: body.paymentEmail || null,
    rut: body.rut,
    status: body.status,
    tenant_id: tenantId
  };
}

function legacyApi(row: Record<string, unknown>) {
  return {
    accountNumber: String(row.account_number ?? ""),
    accountType: String(row.account_type ?? ""),
    bankCode: String(row.bank_code ?? ""),
    bankName: String(row.bank_name ?? ""),
    id: String(row.id),
    name: String(row.name ?? ""),
    observation: String(row.observation ?? ""),
    paymentEmail: String(row.payment_email ?? ""),
    rut: String(row.rut ?? ""),
    status: String(row.status ?? "active")
  };
}

export async function GET(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const query = (new URL(request.url).searchParams.get("q")?.trim() ?? "").replace(/[%,()]/g, " ");
  const supabase = createAdminClient();
  let beneficiaryBuilder = supabase
    .from("payment_beneficiaries")
    .select("id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,observation,status")
    .eq("tenant_id", ctx.membership.tenant_id)
    .order("name")
    .limit(80);
  if (query) beneficiaryBuilder = beneficiaryBuilder.or(`name.ilike.%${query}%,rut.ilike.%${query}%,payment_email.ilike.%${query}%`);
  const supplierQuery = supabase
    .from("suppliers")
    .select("id,rut,legal_name,trade_name,email,commercial_email,payment_email,phone,observations,supplier_bank_accounts(bank_name,bank_code,account_type,account_number,account_holder_name,account_holder_rut,status)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .limit(80);
  const supplierBuilder = query
    ? supplierQuery.or(`legal_name.ilike.%${query}%,trade_name.ilike.%${query}%,rut.ilike.%${query}%,email.ilike.%${query}%,payment_email.ilike.%${query}%,commercial_email.ilike.%${query}%`)
    : supplierQuery;
  const [beneficiaries, suppliers] = await Promise.all([beneficiaryBuilder, supplierBuilder]);
  if (beneficiaries.error) return NextResponse.json({ ok: false, error: beneficiaries.error.message }, { status: 500 });
  if (suppliers.error) return NextResponse.json({ ok: false, error: suppliers.error.message }, { status: 500 });
  const merged = mergeCandidates([
    ...masterCandidates(query),
    ...((suppliers.data ?? []) as Parameters<typeof candidateFromSupplier>[0][]).map(candidateFromSupplier),
    ...(beneficiaries.data ?? []).map((row) => toApi(row as Record<string, unknown>))
  ]);
  return NextResponse.json({ beneficiaries: merged, ok: true });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const parsed = beneficiarySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "beneficiary_validation_failed", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const body = parsed.data;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_beneficiaries")
    .upsert(toDbPayload(body, ctx.membership.tenant_id, ctx.user.id), { onConflict: "tenant_id,rut,bank_code,account_number" })
    .select("id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,observation,status")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "beneficiary_save_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: legacyApi(data),
    company_id: ctx.membership.company_id,
    entity_id: data.id,
    entity_type: "payment_beneficiary",
    event_type: "payment_beneficiary.upserted",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ beneficiary: toApi(data), ok: true });
}
