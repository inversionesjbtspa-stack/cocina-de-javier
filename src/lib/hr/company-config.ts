export type HrCompanyConfig = {
  address: string;
  legalName: string;
  phone: string;
  rut: string;
};

export const fallbackHrCompanyConfig: HrCompanyConfig = {
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "",
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? "Empresa",
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "",
  rut: process.env.NEXT_PUBLIC_COMPANY_RUT ?? ""
};

export function companyConfigFromRow(row: unknown): HrCompanyConfig {
  const record = row as Record<string, string | null | undefined> | null | undefined;
  return {
    address: record?.address || fallbackHrCompanyConfig.address,
    legalName: record?.legal_name || record?.name || fallbackHrCompanyConfig.legalName,
    phone: record?.phone || fallbackHrCompanyConfig.phone,
    rut: record?.rut || fallbackHrCompanyConfig.rut
  };
}

export function mergeCompanyConfig(primary: HrCompanyConfig, fallback: HrCompanyConfig): HrCompanyConfig {
  return {
    address: primary.address || fallback.address,
    legalName: primary.legalName && primary.legalName !== "Empresa" ? primary.legalName : fallback.legalName,
    phone: primary.phone || fallback.phone,
    rut: primary.rut || fallback.rut
  };
}
