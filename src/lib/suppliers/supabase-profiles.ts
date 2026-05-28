import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminConfig } from "@/lib/env";

export type SupplierPaymentProfile = {
  id: string;
  rut: string;
  legalName: string;
  tradeName: string;
  giro: string;
  address: string;
  commune: string;
  city: string;
  contactName: string;
  phone: string;
  paymentEmail: string;
  commercialEmail: string;
  email: string;
  category: string;
  paymentTermsLabel: string;
  paymentTermsDays: number;
  observations: string;
  status: string;
  source: string;
  bankAccountId: string | null;
  bankName: string;
  bankCode: string;
  accountType: string;
  accountNumber: string;
  accountHolderName: string;
  accountHolderRut: string;
  pending: number;
  overdue: number;
  invoices: Array<{ folio: string; date: string; total: number; status: string }>;
  missingPaymentFields: string[];
  paymentReady: boolean;
};

export function paymentMissingFields(profile: Pick<SupplierPaymentProfile, "rut" | "legalName" | "bankName" | "bankCode" | "accountType" | "accountNumber" | "paymentEmail" | "email" | "status">) {
  const missing = [];
  if (!profile.rut) missing.push("RUT");
  if (!profile.legalName) missing.push("razon social");
  if (!profile.bankName) missing.push("banco");
  if (!profile.bankCode) missing.push("codigo banco");
  if (!profile.accountType) missing.push("tipo de cuenta");
  if (!profile.accountNumber) missing.push("numero de cuenta");
  if (!(profile.paymentEmail || profile.email)) missing.push("email de pagos");
  if (profile.status === "blocked") missing.push("proveedor bloqueado");
  return missing;
}

export async function getSupplierPaymentProfiles(): Promise<SupplierPaymentProfile[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id,rut,legal_name,trade_name,giro,address,commune,city,email,commercial_email,payment_email,phone,category,payment_terms_days,payment_terms_label,observations,status,profile_source,supplier_contacts(name,is_primary),supplier_bank_accounts(id,bank_name,bank_code,account_type,account_number,account_holder_name,account_holder_rut,status),accounts_payable(id,document_number,due_date,issue_date,total_amount,balance_amount,status)")
    .order("legal_name")
    .limit(1000);
  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).map((row) => {
    const contacts = row.supplier_contacts as Array<{ name: string; is_primary: boolean }> | undefined;
    const bankAccounts = row.supplier_bank_accounts as Array<{ id: string; bank_name: string; bank_code: string | null; account_type: string; account_number: string; account_holder_name: string | null; account_holder_rut: string | null; status: string }> | undefined;
    const bank = bankAccounts?.find((item) => item.status !== "disabled") ?? bankAccounts?.[0];
    const payable = (row.accounts_payable as Array<{ document_number: string; due_date: string; issue_date: string; total_amount: number; balance_amount: number; status: string }> | undefined) ?? [];
    const profile = {
      accountNumber: bank?.account_number ?? "",
      accountType: bank?.account_type ?? "",
      accountHolderName: bank?.account_holder_name ?? row.legal_name,
      accountHolderRut: bank?.account_holder_rut ?? row.rut,
      address: row.address ?? "",
      bankAccountId: bank?.id ?? null,
      bankCode: bank?.bank_code ?? "",
      bankName: bank?.bank_name ?? "",
      category: row.category ?? "",
      city: row.city ?? "",
      commercialEmail: row.commercial_email ?? "",
      commune: row.commune ?? "",
      contactName: contacts?.find((contact) => contact.is_primary)?.name ?? contacts?.[0]?.name ?? "",
      email: row.email ?? "",
      giro: row.giro ?? "",
      id: row.id,
      invoices: payable.map((item) => ({ date: item.issue_date, folio: item.document_number, status: item.status, total: Number(item.total_amount ?? 0) })),
      legalName: row.legal_name,
      observations: row.observations ?? "",
      overdue: payable.filter((item) => item.due_date < today && !["paid", "rejected", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.balance_amount ?? 0), 0),
      paymentEmail: row.payment_email ?? "",
      paymentTermsDays: Number(row.payment_terms_days ?? 30),
      paymentTermsLabel: row.payment_terms_label ?? "",
      pending: payable.filter((item) => !["paid", "rejected", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.balance_amount ?? 0), 0),
      phone: row.phone ?? "",
      rut: row.rut,
      source: row.profile_source ?? "xml",
      status: row.status,
      tradeName: row.trade_name ?? ""
    } satisfies Omit<SupplierPaymentProfile, "missingPaymentFields" | "paymentReady">;
    const missingPaymentFields = paymentMissingFields(profile);
    return { ...profile, missingPaymentFields, paymentReady: missingPaymentFields.length === 0 };
  });
}
