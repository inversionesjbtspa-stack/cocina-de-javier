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

export async function getPayableCandidates(): Promise<PayableCandidate[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("accounts_payable")
    .select("id,document_number,issue_date,due_date,total_amount,balance_amount,status,source_type,xml_status,is_payable_without_xml,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_name_normalized,bank_code,bank_mapping_needs_review,account_type,account_number,status))")
    .not("status", "in", "(paid,rejected,cancelled)")
    .order("due_date")
    .limit(1200);
  return (data ?? []).map((row) => {
    type SupplierRow = { id: string; rut: string; legal_name: string; email: string | null; payment_email: string | null; status: string; supplier_bank_accounts?: Array<{ bank_name: string; bank_name_normalized: string | null; bank_code: string | null; bank_mapping_needs_review: boolean; account_type: string; account_number: string; status: string }> };
    const supplier = (Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers) as SupplierRow;
    const bank = supplier.supplier_bank_accounts?.find((account) => account.status !== "disabled") ?? supplier.supplier_bank_accounts?.[0];
    const validation = { accountNumber: bank?.account_number ?? "", accountType: bank?.account_type ?? "", bankCode: bank?.bank_code ?? "", bankName: bank?.bank_name ?? "", email: supplier.email ?? "", legalName: supplier.legal_name, paymentEmail: supplier.payment_email ?? "", rut: supplier.rut, status: supplier.status };
    const alerts = paymentMissingFields(validation);
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
      email: supplier.payment_email ?? supplier.email ?? "",
      id: row.id,
      issueDate: row.issue_date,
      ok: alerts.length === 0 && Number(row.balance_amount ?? 0) > 0,
      payableWithoutXml: Boolean(row.is_payable_without_xml),
      sourceType: row.source_type ?? "xml",
      status: row.status,
      supplierId: supplier.id,
      supplierName: supplier.legal_name,
      supplierRut: supplier.rut,
      xmlStatus: row.xml_status ?? "received"
    };
  });
}
