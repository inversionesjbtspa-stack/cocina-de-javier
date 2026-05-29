import { suppliersMaster, normalizeRut, type MasterSupplier } from "@/lib/suppliers/master";

export type BeneficiaryCandidate = {
  accountNumber: string;
  accountType: string;
  bankCode: string;
  bankName: string;
  commercialEmail: string;
  id: string;
  name: string;
  observation: string;
  paymentEmail: string;
  phone: string;
  rut: string;
  source: "master" | "supplier" | "beneficiary";
  sourceId: string;
  status: string;
};

type SupplierCandidateRow = {
  id: string;
  rut: string;
  legal_name: string;
  trade_name: string | null;
  email: string | null;
  commercial_email: string | null;
  payment_email: string | null;
  phone: string | null;
  observations: string | null;
  supplier_bank_accounts?: Array<{
    bank_name: string | null;
    bank_code: string | null;
    account_type: string | null;
    account_number: string | null;
    account_holder_name: string | null;
    account_holder_rut: string | null;
    status: string | null;
  }>;
};

function compact(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedText(value: unknown) {
  return compact(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function validAccountType(value: string) {
  return value || "no_informada_master";
}

export function candidateComplete(candidate: Pick<BeneficiaryCandidate, "accountNumber" | "accountType" | "bankCode" | "bankName" | "name" | "paymentEmail" | "rut" | "status">) {
  return Boolean(candidate.status === "active" && candidate.name && candidate.rut && candidate.bankName && candidate.bankCode && candidate.accountType && candidate.accountNumber && candidate.paymentEmail);
}

export function candidateFromMaster(master: MasterSupplier): BeneficiaryCandidate {
  return {
    accountNumber: compact(master.bankAccount),
    accountType: validAccountType(compact(master.accountType)),
    bankCode: compact(master.bankCode),
    bankName: compact(master.bankName),
    commercialEmail: compact(master.email),
    id: `master:${normalizeRut(master.rut)}:${compact(master.bankCode)}:${compact(master.bankAccount)}`,
    name: compact(master.businessName || master.tradeName),
    observation: compact(master.observations),
    paymentEmail: compact(master.email),
    phone: compact(master.phone),
    rut: compact(master.rut),
    source: "master",
    sourceId: compact(master.code || master.rut),
    status: "active"
  };
}

export function candidateFromSupplier(supplier: SupplierCandidateRow): BeneficiaryCandidate {
  const bank = supplier.supplier_bank_accounts?.find((account) => account.status !== "disabled") ?? supplier.supplier_bank_accounts?.[0];
  return {
    accountNumber: compact(bank?.account_number),
    accountType: validAccountType(compact(bank?.account_type)),
    bankCode: compact(bank?.bank_code),
    bankName: compact(bank?.bank_name),
    commercialEmail: compact(supplier.commercial_email || supplier.email),
    id: `supplier:${supplier.id}`,
    name: compact(bank?.account_holder_name || supplier.legal_name || supplier.trade_name),
    observation: compact(supplier.observations),
    paymentEmail: compact(supplier.payment_email || supplier.email || supplier.commercial_email),
    phone: compact(supplier.phone),
    rut: compact(bank?.account_holder_rut || supplier.rut),
    source: "supplier",
    sourceId: supplier.id,
    status: "active"
  };
}

export function candidateFromBeneficiary(row: Record<string, unknown>): BeneficiaryCandidate {
  return {
    accountNumber: compact(row.account_number),
    accountType: validAccountType(compact(row.account_type)),
    bankCode: compact(row.bank_code),
    bankName: compact(row.bank_name),
    commercialEmail: "",
    id: String(row.id),
    name: compact(row.name),
    observation: compact(row.observation),
    paymentEmail: compact(row.payment_email),
    phone: "",
    rut: compact(row.rut),
    source: "beneficiary",
    sourceId: String(row.id),
    status: compact(row.status || "active")
  };
}

export function masterCandidates(query: string, limit = 40) {
  const needle = normalizedText(query);
  return suppliersMaster.suppliers
    .filter((supplier) => {
      if (!needle) return true;
      const haystack = normalizedText([
        supplier.businessName,
        supplier.tradeName,
        supplier.rut,
        supplier.email,
        supplier.code,
        supplier.bankName
      ].join(" "));
      return haystack.includes(needle);
    })
    .slice(0, limit)
    .map(candidateFromMaster);
}

export function mergeCandidates(candidates: BeneficiaryCandidate[]) {
  const priority = { master: 0, supplier: 1, beneficiary: 2 } satisfies Record<BeneficiaryCandidate["source"], number>;
  const byKey = new Map<string, BeneficiaryCandidate>();
  for (const candidate of candidates.sort((a, b) => priority[a.source] - priority[b.source])) {
    const key = [normalizeRut(candidate.rut), candidate.bankCode, candidate.accountNumber].join("|");
    if (!byKey.has(key)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}
