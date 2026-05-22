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
  accountType: string;
  email: string;
  alerts: string[];
  ok: boolean;
};

export async function getPayableCandidates(): Promise<PayableCandidate[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("accounts_payable")
    .select("id,document_number,issue_date,due_date,total_amount,balance_amount,status,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_code,account_type,account_number,status))")
    .not("status", "in", "(paid,rejected,cancelled)")
    .order("due_date")
    .limit(1200);
  return (data ?? []).map((row) => {
    type SupplierRow = { id: string; rut: string; legal_name: string; email: string | null; payment_email: string | null; status: string; supplier_bank_accounts?: Array<{ bank_name: string; bank_code: string | null; account_type: string; account_number: string; status: string }> };
    const supplier = (Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers) as SupplierRow;
    const bank = supplier.supplier_bank_accounts?.find((account) => account.status !== "disabled") ?? supplier.supplier_bank_accounts?.[0];
    const validation = { accountNumber: bank?.account_number ?? "", accountType: bank?.account_type ?? "", bankName: bank?.bank_name ?? "", email: supplier.email ?? "", paymentEmail: supplier.payment_email ?? "", rut: supplier.rut, status: supplier.status };
    const alerts = paymentMissingFields(validation);
    return {
      accountType: bank?.account_type ?? "",
      alerts,
      amount: Number(row.total_amount ?? 0),
      balance: Number(row.balance_amount ?? 0),
      bankAccount: bank?.account_number ?? "",
      bankCode: bank?.bank_code ?? "",
      bankName: bank?.bank_name ?? "",
      documentNumber: row.document_number,
      dueDate: row.due_date,
      email: supplier.payment_email ?? supplier.email ?? "",
      id: row.id,
      issueDate: row.issue_date,
      ok: alerts.length === 0 && Number(row.balance_amount ?? 0) > 0,
      status: row.status,
      supplierId: supplier.id,
      supplierName: supplier.legal_name,
      supplierRut: supplier.rut
    };
  });
}
