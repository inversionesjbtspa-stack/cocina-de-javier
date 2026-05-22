import { createAdminClient } from "@/lib/supabase/admin";
import { mapBankName, mappedBanks } from "@/lib/payments/bank-mappings";
import { paymentMissingFields } from "@/lib/suppliers/supabase-profiles";

type BankActor = { role: string; userId: string; tenantId: string; companyId: string | null };
type BankRow = {
  id: string;
  supplier_id: string;
  bank_name: string;
  bank_code: string | null;
  bank_raw: string | null;
  account_type: string;
  account_number: string;
};
type PayableValidationRow = {
  id: string;
  supplier_id: string;
  suppliers: {
    id: string;
    rut: string;
    legal_name: string;
    email: string | null;
    payment_email: string | null;
    status: string;
    supplier_bank_accounts: Array<{
      bank_name: string;
      bank_code: string | null;
      account_type: string;
      account_number: string;
      bank_mapping_needs_review: boolean;
      status: string;
    }>;
  } | Array<{
    id: string;
    rut: string;
    legal_name: string;
    email: string | null;
    payment_email: string | null;
    status: string;
    supplier_bank_accounts: Array<{
      bank_name: string;
      bank_code: string | null;
      account_type: string;
      account_number: string;
      bank_mapping_needs_review: boolean;
      status: string;
    }>;
  }> | null;
};

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function repairBankCodes(actor: BankActor) {
  const supabase = createAdminClient();
  const mappings = mappedBanks().flatMap((mapping) =>
    mapping.aliases.map((alias) => ({
      bank_code: mapping.bankCode,
      bank_name_normalized: mapping.bankNameNormalized,
      confidence: 1,
      needs_review: false,
      raw_pattern: alias,
      source: "master proveedores jesus"
    }))
  );
  const { error: mappingError } = await supabase.from("bank_mappings").upsert(mappings, { onConflict: "raw_pattern" });
  if (mappingError) throw mappingError;
  const { data: banks, error } = await supabase
    .from("supplier_bank_accounts")
    .select("id,supplier_id,bank_name,bank_code,bank_raw,account_type,account_number")
    .eq("tenant_id", actor.tenantId)
    .limit(7000);
  if (error) throw error;
  const typedBanks = (banks ?? []) as BankRow[];
  const beforeMissingCode = typedBanks.filter((bank) => bank.bank_name && !bank.bank_code).length;
  const uniqueMissingBefore = new Set(typedBanks.filter((bank) => bank.bank_name && !bank.bank_code).map((bank) => bank.bank_name));
  let bankCodesCompleted = 0;
  let banksReviewed = 0;
  const unmapped = new Map<string, number>();
  const repairedExamples: Array<{ raw: string; normalized: string; code: string; needsReview: boolean }> = [];

  for (const bank of typedBanks) {
    banksReviewed += 1;
    const raw = bank.bank_raw || bank.bank_name;
    const mapping = mapBankName(raw);
    const bankCode = bank.bank_code || mapping.bankCode || null;
    const needsReview = !bankCode || mapping.needsReview;
    if (!bank.bank_code && bankCode) bankCodesCompleted += 1;
    if (!bankCode) unmapped.set(raw || "SIN BANCO", (unmapped.get(raw || "SIN BANCO") ?? 0) + 1);
    if (repairedExamples.length < 40 && (bank.bank_name !== mapping.bankNameNormalized || !bank.bank_code)) repairedExamples.push({ code: bankCode ?? "", needsReview, normalized: mapping.bankNameNormalized, raw });
    await supabase.from("supplier_bank_accounts").update({
      bank_code: bankCode,
      bank_mapping_confidence: mapping.confidence,
      bank_mapping_needs_review: needsReview,
      bank_name: mapping.bankNameNormalized === "SIN BANCO" ? bank.bank_name : mapping.bankNameNormalized,
      bank_name_normalized: mapping.bankNameNormalized,
      bank_raw: raw
    }).eq("id", bank.id);
  }

  const { data: paymentRows } = await supabase
    .from("accounts_payable")
    .select("id,supplier_id,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_code,account_type,account_number,bank_mapping_needs_review,status))")
    .eq("tenant_id", actor.tenantId)
    .not("status", "in", "(paid,rejected,cancelled)")
    .limit(5000);
  let accountsPayableRevalidated = 0;
  const stillInvalid: Array<{ payableId: string; supplierId: string; supplierName: string; rut: string; bank: string; alerts: string[] }> = [];
  for (const payable of (paymentRows ?? []) as PayableValidationRow[]) {
    const supplier = one(payable.suppliers);
    if (!supplier) continue;
    const bank = supplier.supplier_bank_accounts?.find((account) => account.status !== "disabled") ?? supplier.supplier_bank_accounts?.[0];
    const alerts = paymentMissingFields({
      accountNumber: bank?.account_number ?? "",
      accountType: bank?.account_type ?? "",
      bankCode: bank?.bank_code ?? "",
      bankName: bank?.bank_name ?? "",
      email: supplier.email ?? "",
      legalName: supplier.legal_name ?? "",
      paymentEmail: supplier.payment_email ?? "",
      rut: supplier.rut ?? "",
      status: supplier.status
    });
    if (bank?.bank_mapping_needs_review && !alerts.includes("banco en revision")) alerts.push("banco en revision");
    await supabase.from("accounts_payable").update({ payment_validation_checked_at: new Date().toISOString(), payment_validation_errors: alerts }).eq("id", payable.id);
    accountsPayableRevalidated += 1;
    if (alerts.length && stillInvalid.length < 500) stillInvalid.push({ alerts, bank: bank?.bank_name ?? "", payableId: payable.id, rut: supplier.rut ?? "", supplierId: supplier.id, supplierName: supplier.legal_name ?? "" });
  }

  const { data: after } = await supabase.from("supplier_bank_accounts").select("id,bank_name,bank_code").eq("tenant_id", actor.tenantId).limit(7000);
  const afterMissingCode = (after ?? []).filter((bank) => bank.bank_name && !bank.bank_code).length;
  const summary = {
    accountsPayableRevalidated,
    bankCodesCompleted,
    banksReviewed,
    before: { bankAccountsMissingCode: beforeMissingCode, uniqueBanksMissingCode: [...uniqueMissingBefore].sort() },
    mappedBanks: mappedBanks(),
    repairedExamples,
    after: { bankAccountsMissingCode: afterMissingCode },
    stillInvalid,
    unmappedBanks: [...unmapped.entries()].map(([bank, count]) => ({ bank, count })).sort((left, right) => right.count - left.count)
  };
  await supabase.from("audit_events").insert({
    actor_role: actor.role,
    actor_user_id: actor.userId,
    after_data: summary,
    company_id: actor.companyId,
    entity_type: "supplier_bank_accounts",
    event_type: "supplier_bank_accounts.bank_codes_repaired",
    tenant_id: actor.tenantId
  });
  return summary;
}
