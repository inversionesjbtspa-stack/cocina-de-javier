import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const assignmentSchema = z.object({
  beneficiary: z.object({
    accountNumber: z.string().trim().min(3).max(80),
    accountType: z.string().trim().min(2).max(80),
    bankCode: z.string().trim().min(1).max(40),
    bankName: z.string().trim().min(2).max(160),
    name: z.string().trim().min(2).max(240),
    observation: z.string().trim().max(1000).optional().default(""),
    paymentEmail: z.string().trim().email().or(z.literal("")),
    rut: z.string().trim().regex(/^[0-9]+-[0-9kK]$/),
    source: z.string().trim().optional().default("beneficiary"),
    sourceId: z.string().trim().optional().default(""),
    status: z.enum(["active", "inactive"]).default("active")
  }).optional(),
  beneficiaryId: z.string().uuid().optional(),
  reason: z.string().trim().max(1000).optional().default("")
}).refine((value) => value.beneficiaryId || value.beneficiary, { message: "beneficiary_required" });

const roles = ["owner", "admin", "finance_manager", "procurement_manager"];

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !roles.includes(membership.data.role)) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  }
  return { error: null, membership: membership.data, user };
}

function beneficiaryComplete(beneficiary: Record<string, unknown> | null | undefined) {
  return Boolean(
    beneficiary &&
    beneficiary.status === "active" &&
    beneficiary.name &&
    beneficiary.rut &&
    beneficiary.bank_name &&
    beneficiary.bank_code &&
    beneficiary.account_type &&
    beneficiary.account_number &&
    beneficiary.payment_email
  );
}

function auditBeneficiary(beneficiary: Record<string, unknown> | null | undefined) {
  if (!beneficiary) return null;
  return {
    account_number: beneficiary.account_number ?? null,
    account_type: beneficiary.account_type ?? null,
    bank_code: beneficiary.bank_code ?? null,
    bank_name: beneficiary.bank_name ?? null,
    id: beneficiary.id ?? null,
    name: beneficiary.name ?? null,
    payment_email: beneficiary.payment_email ?? null,
    rut: beneficiary.rut ?? null,
    status: beneficiary.status ?? null
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const body = assignmentSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ ok: false, error: "assignment_validation_failed", fields: body.error.flatten().fieldErrors }, { status: 422 });
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id,tenant_id,company_id,rut,legal_name")
    .eq("id", id)
    .eq("tenant_id", ctx.membership.tenant_id)
    .single();
  if (!supplier) return NextResponse.json({ ok: false, error: "supplier_not_found" }, { status: 404 });
  const beneficiaryQuery = body.data.beneficiaryId
    ? supabase
      .from("payment_beneficiaries")
      .select("id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,status")
      .eq("id", body.data.beneficiaryId)
      .eq("tenant_id", ctx.membership.tenant_id)
      .single()
    : supabase
      .from("payment_beneficiaries")
      .upsert({
        account_number: body.data.beneficiary!.accountNumber,
        account_type: body.data.beneficiary!.accountType,
        bank_code: body.data.beneficiary!.bankCode,
        bank_name: body.data.beneficiary!.bankName,
        created_by: ctx.user.id,
        name: body.data.beneficiary!.name,
        observation: body.data.beneficiary!.observation || null,
        payment_email: body.data.beneficiary!.paymentEmail || null,
        rut: body.data.beneficiary!.rut,
        status: body.data.beneficiary!.status,
        tenant_id: ctx.membership.tenant_id
      }, { onConflict: "tenant_id,rut,bank_code,account_number" })
      .select("id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,status")
      .single();
  const { data: beneficiary, error: beneficiaryError } = await beneficiaryQuery;
  if (beneficiaryError || !beneficiary) return NextResponse.json({ ok: false, error: "beneficiary_not_found" }, { status: 404 });
  if (!beneficiaryComplete(beneficiary)) return NextResponse.json({ ok: false, error: "beneficiary_incomplete_for_payment" }, { status: 422 });
  const { data: activeLinks } = await supabase
    .from("supplier_payment_beneficiary_links")
    .select("id,payment_beneficiaries(id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,status)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("supplier_id", id)
    .eq("is_active", true);
  const previousLink = activeLinks?.[0] as Record<string, unknown> | undefined;
  const previousBeneficiary = previousLink
    ? Array.isArray(previousLink.payment_beneficiaries)
      ? previousLink.payment_beneficiaries[0]
      : previousLink.payment_beneficiaries
    : null;
  if (activeLinks?.length) {
    await supabase
      .from("supplier_payment_beneficiary_links")
      .update({ is_active: false, removed_at: new Date().toISOString(), removed_by: ctx.user.id })
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("supplier_id", id)
      .eq("is_active", true);
  }
  const { data: link, error } = await supabase
    .from("supplier_payment_beneficiary_links")
    .insert({
      assigned_by: ctx.user.id,
      payment_beneficiary_id: beneficiary.id,
      reason: body.data.reason || null,
      supplier_id: id,
      tenant_id: ctx.membership.tenant_id
    })
    .select("id")
    .single();
  if (error || !link) return NextResponse.json({ ok: false, error: error?.message ?? "beneficiary_assignment_failed" }, { status: 422 });
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: {
      assigned_at: new Date().toISOString(),
      beneficiario_anterior: auditBeneficiary(previousBeneficiary as Record<string, unknown> | null),
      beneficiario_nuevo: auditBeneficiary(beneficiary),
      factura_emitida_por: supplier.legal_name,
      motivo: body.data.reason || null,
      payment_beneficiary_new: auditBeneficiary(beneficiary),
      payment_beneficiary_previous: auditBeneficiary(previousBeneficiary as Record<string, unknown> | null),
      payment_beneficiary_source: body.data.beneficiary?.source ?? "payment_beneficiaries",
      payment_beneficiary_source_id: body.data.beneficiary?.sourceId ?? body.data.beneficiaryId ?? null,
      proveedor_facturador: supplier.legal_name,
      rut_facturador: supplier.rut
    },
    before_data: { payment_beneficiary_previous: auditBeneficiary(previousBeneficiary as Record<string, unknown> | null) },
    company_id: supplier.company_id,
    entity_id: id,
    entity_type: "supplier",
    event_type: "supplier.payment_beneficiary_assigned",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ linkId: link.id, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id,tenant_id,company_id,rut,legal_name")
    .eq("id", id)
    .eq("tenant_id", ctx.membership.tenant_id)
    .single();
  if (!supplier) return NextResponse.json({ ok: false, error: "supplier_not_found" }, { status: 404 });
  const { data: activeLinks } = await supabase
    .from("supplier_payment_beneficiary_links")
    .select("id,payment_beneficiaries(id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,status)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("supplier_id", id)
    .eq("is_active", true);
  const previousLink = activeLinks?.[0] as Record<string, unknown> | undefined;
  const previousBeneficiary = previousLink
    ? Array.isArray(previousLink.payment_beneficiaries)
      ? previousLink.payment_beneficiaries[0]
      : previousLink.payment_beneficiaries
    : null;
  await supabase
    .from("supplier_payment_beneficiary_links")
    .update({ is_active: false, removed_at: new Date().toISOString(), removed_by: ctx.user.id })
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("supplier_id", id)
    .eq("is_active", true);
  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: {
      beneficiario_anterior: auditBeneficiary(previousBeneficiary as Record<string, unknown> | null),
      beneficiario_nuevo: null,
      factura_emitida_por: supplier.legal_name,
      payment_beneficiary_previous: auditBeneficiary(previousBeneficiary as Record<string, unknown> | null),
      proveedor_facturador: supplier.legal_name,
      removed_at: new Date().toISOString(),
      rut_facturador: supplier.rut
    },
    company_id: supplier.company_id,
    entity_id: id,
    entity_type: "supplier",
    event_type: "supplier.payment_beneficiary_removed",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true });
}
