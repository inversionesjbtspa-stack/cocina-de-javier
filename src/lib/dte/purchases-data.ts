import dtePurchases from "@/data/dte-purchases-2026.json";

export type DtePurchaseItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

export type DtePurchaseInvoice = {
  normalizedKey?: string;
  tipoDte: string;
  documentType: string;
  folio: string;
  rutEmisor: string;
  razonSocialEmisor: string;
  rutReceptor: string;
  razonSocialReceptor: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
  paymentStatus: string;
  items: DtePurchaseItem[];
};

type SummaryRow = {
  key: string;
  documents: number;
  invoices: number;
  creditNotes: number;
  total: number;
  iva: number;
  totalClp: string;
  ivaClp: string;
};

type SupplierSummary = {
  rut: string;
  razonSocial: string;
  documents: number;
  total: number;
  totalClp: string;
};

type ProductSummary = {
  description: string;
  quantity: number;
  documents: number;
  total: number;
  totalClp: string;
  lastPrices: Array<{
    date: string;
    folio: string;
    supplier: string;
    unitPrice: number;
  }>;
};

type RawDtePurchaseData = Omit<DtePurchaseData, "summaries"> & {
  summaries: {
    byDay: SummaryRow[] | SummaryRow;
    byMonth: SummaryRow[] | SummaryRow;
    byYear: SummaryRow[] | SummaryRow;
    suppliers: SupplierSummary[] | SupplierSummary;
    products: ProductSummary[] | ProductSummary;
  };
};

export type DtePurchaseData = {
  generatedAt: string;
  invoiceCount: number;
  invoices: DtePurchaseInvoice[];
  summaries: {
    byDay: SummaryRow[];
    byMonth: SummaryRow[];
    byYear: SummaryRow[];
    suppliers: SupplierSummary[];
    products: ProductSummary[];
  };
};

function asArray<T>(value: T[] | T): T[] {
  return Array.isArray(value) ? value : [value];
}

const rawPurchasesData = dtePurchases as unknown as RawDtePurchaseData;

export const purchasesData: DtePurchaseData = {
  ...rawPurchasesData,
  summaries: {
    byDay: asArray(rawPurchasesData.summaries.byDay),
    byMonth: asArray(rawPurchasesData.summaries.byMonth),
    byYear: asArray(rawPurchasesData.summaries.byYear),
    products: asArray(rawPurchasesData.summaries.products),
    suppliers: asArray(rawPurchasesData.summaries.suppliers)
  }
};

export function formatClp(value: number) {
  return new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

export function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

export function formatMonth(key: string) {
  const [year, month] = key.split("-");
  const names = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ];
  return `${names[Number(month) - 1]} ${year}`;
}

export function currentMonthInvoices() {
  const currentMonth = purchasesData.summaries.byMonth[0]?.key ?? "2026-05";
  return purchasesData.invoices.filter((invoice) =>
    invoice.fechaEmision.startsWith(currentMonth)
  );
}

export function totalsFor(invoices: DtePurchaseInvoice[]) {
  return invoices.reduce(
    (acc, invoice) => {
      const sign = invoice.tipoDte === "61" ? -1 : 1;
      acc.documents += 1;
      acc.invoices += invoice.tipoDte === "61" ? 0 : 1;
      acc.creditNotes += invoice.tipoDte === "61" ? 1 : 0;
      acc.total += sign * invoice.montoTotal;
      acc.iva += sign * invoice.iva;
      return acc;
    },
    { creditNotes: 0, documents: 0, invoices: 0, iva: 0, total: 0 }
  );
}
