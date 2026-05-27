import { unstable_noStore as noStore } from "next/cache";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentMissingFields } from "@/lib/suppliers/supabase-profiles";

export type PayableCandidate = {
  id: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  balance: number;
  status: string;
  supplierId: string;
  supplierRut: string;
  supplierName: string;
  bankAccount: string;
  bankCode: string;
  bankName: string;
  bankNameNormalized: string;
  bankNeedsReview: boolean;
  accountType: string;
  email: string;
  alerts: string[];
  ok: boolean;
  sourceType: string;
  xmlStatus: string;
  payableWithoutXml: boolean;
};

export type PayableDiagnostics = {
  error: string | null;
  fetched: number;
  invalid: number;
  valid: number;
  totalBalance: number;
};

export type PayablesResult = {
  candidates: PayableCandidate[];
  diagnostics: PayableDiagnostics;
};

export async function getPayableCandidatesResult(): Promise<PayablesResult> {
  noStore();
  if (!hasSupabaseAdminConfig()) {
    return { candidates: [], diagnostics: { error: "Supabase admin no configurado", fetched: 0, invalid: 0, totalBalance: 0, valid: 0 } };
  }
  const supabase = createAdminClient();
  const richSelect = "id,document_number,issue_date,due_date,total_amount,balance_amount,status,source_type,xml_status,is_payable_without_xml,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_name_normalized,bank_code,bank_mapping_needs_review,account_type,account_number,status))";
  const legacySelect = "id,document_number,issue_date,due_date,total_amount,balance_amount,status,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_name_normalized,bank_code,bank_mapping_needs_review,account_type,account_number,status))";
  const query = supabase
    .from("accounts_payable")
    .select(richSelect)
    .order("due_date")
    .limit(1200);
  const { data, error } = await query.not("status", "in", "(paid,rejected,cancelled)");
  const legacyResult = error
    ? await supabase
      .from("accounts_payable")
      .select(legacySelect)
      .order("due_date")
      .limit(1200)
    : null;
  const rows = (error ? legacyResult?.data : data) ?? [];
  const diagnosticsError = legacyResult?.error?.message ?? error?.message ?? null;

  const candidates = rows.filter((row) => !["paid", "rejected", "cancelled"].includes(String(row.status))).map((row) => {
    type SupplierRow = { id: string; rut: string; legal_name: string; email: string | null; payment_email: string | null; status: string; supplier_bank_accounts?: Array<{ bank_name: string; bank_name_normalized: string | null; bank_code: string | null; bank_mapping_needs_review: boolean; account_type: string; account_number: string; status: string }> };
    const record = row as Record<string, unknown>;
    const supplier = (Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers) as SupplierRow | null;
    const bank = supplier?.supplier_bank_accounts?.find((account) => account.status !== "disabled") ?? supplier?.supplier_bank_accounts?.[0];
    const validation = { accountNumber: bank?.account_number ?? "", accountType: bank?.account_type ?? "", bankCode: bank?.bank_code ?? "", bankName: bank?.bank_name ?? "", email: supplier?.email ?? "", legalName: supplier?.legal_name ?? "", paymentEmail: supplier?.payment_email ?? "", rut: supplier?.rut ?? "", status: supplier?.status ?? "" };
    const alerts = paymentMissingFields(validation);
    if (!supplier) alerts.push("proveedor sin enlace");
    if (bank?.bank_mapping_needs_review) alerts.push("banco en revision");
    return {
      accountType: bank?.account_type ?? "",
      alerts,
      amount: Number(row.total_amount ?? 0),
      balance: Number(row.balance_amount ?? 0),
      bankAccount: bank?.account_number ?? "",
      bankCode: bank?.bank_code ?? "",
      bankName: bank?.bank_name ?? "",
      bankNameNormalized: bank?.bank_name_normalized ?? "",
      bankNeedsReview: Boolean(bank?.bank_mapping_needs_review),
      documentNumber: row.document_number,
      dueDate: row.due_date,
      email: supplier?.payment_email ?? supplier?.email ?? "",
      id: row.id,
      issueDate: row.issue_date,
      ok: alerts.length === 0 && Number(row.balance_amount ?? 0) > 0,
      payableWithoutXml: Boolean(record.is_payable_without_xml ?? false),
      sourceType: typeof record.source_type === "string" ? record.source_type : "xml",
      status: row.status,
      supplierId: supplier?.id ?? "",
      supplierName: supplier?.legal_name ?? "Cuenta por pagar sin proveedor",
      supplierRut: supplier?.rut ?? "",
      xmlStatus: typeof record.xml_status === "string" ? record.xml_status : "received"
    };
  });
  return {
    candidates,
    diagnostics: {
      error: diagnosticsError,
      fetched: candidates.length,
      invalid: candidates.filter((row) => !row.ok).length,
      totalBalance: candidates.reduce((sum, row) => sum + row.balance, 0),
      valid: candidates.filter((row) => row.ok).length
    }
  };
}

export async function getPayableCandidates(): Promise<PayableCandidate[]> {
  return (await getPayableCandidatesResult()).candidates;
}
