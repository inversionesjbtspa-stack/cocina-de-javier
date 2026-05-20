import { unstable_noStore as noStore } from "next/cache";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatClp,
  purchasesData,
  type DtePurchaseData,
  type DtePurchaseInvoice,
  type DtePurchaseItem
} from "@/lib/dte/purchases-data";

type DteRow = {
  id: string;
  tipo_dte: string;
  folio: string;
  rut_emisor: string;
  razon_social_emisor: string | null;
  rut_receptor: string;
  razon_social_receptor: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_neto: number;
  monto_exento: number;
  iva: number;
  monto_total: number;
  idempotency_key: string;
  dte_items?: Array<{
    line_number: number;
    name: string | null;
    description: string;
    item_description_raw: string | null;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total: number;
    item_validation_status: string | null;
    price_confidence_score: number | null;
  }>;
};

function documentType(tipoDte: string) {
  if (tipoDte === "61") {
    return "Nota credito electronica";
  }
  if (tipoDte === "34") {
    return "Factura exenta electronica";
  }
  return "Factura electronica";
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInvoice(row: DteRow): DtePurchaseInvoice {
  const items: DtePurchaseItem[] = (row.dte_items ?? []).map((item) => ({
    description: item.name || item.description || "SIN DESCRIPCION XML",
    detailDescription: item.item_description_raw,
    lineNumber: item.line_number,
    lineTotal: toNumber(item.line_total),
    name: item.name ?? undefined,
    priceConfidenceScore: toNumber(item.price_confidence_score),
    quantity: toNumber(item.quantity),
    unit: item.unit,
    unitPrice: toNumber(item.unit_price),
    validationStatus: item.item_validation_status ?? "unchecked"
  }));

  return {
    documentType: documentType(row.tipo_dte),
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento ?? row.fecha_emision,
    folio: row.folio,
    items,
    montoExento: toNumber(row.monto_exento),
    montoNeto: toNumber(row.monto_neto),
    montoTotal: toNumber(row.monto_total),
    normalizedKey: row.idempotency_key,
    paymentStatus: "Pendiente",
    razonSocialEmisor: row.razon_social_emisor ?? row.rut_emisor,
    razonSocialReceptor: row.razon_social_receptor ?? row.rut_receptor,
    rutEmisor: row.rut_emisor,
    rutReceptor: row.rut_receptor,
    tipoDte: row.tipo_dte,
    iva: toNumber(row.iva)
  };
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function summarize(invoices: DtePurchaseInvoice[]): DtePurchaseData["summaries"] {
  const byDay = new Map<string, DtePurchaseData["summaries"]["byDay"][number]>();
  const byMonth = new Map<string, DtePurchaseData["summaries"]["byMonth"][number]>();
  const byYear = new Map<string, DtePurchaseData["summaries"]["byYear"][number]>();
  const suppliers = new Map<string, { rut: string; razonSocial: string; documents: number; total: number; totalClp: string }>();
  const products = new Map<string, DtePurchaseData["summaries"]["products"][number]>();

  function addSummary(map: typeof byDay, key: string, invoice: DtePurchaseInvoice) {
    const row = map.get(key) ?? {
      creditNotes: 0,
      documents: 0,
      invoices: 0,
      iva: 0,
      ivaClp: formatClp(0),
      key,
      total: 0,
      totalClp: formatClp(0)
    };
    const sign = invoice.tipoDte === "61" ? -1 : 1;
    row.documents += 1;
    row.invoices += invoice.tipoDte === "61" ? 0 : 1;
    row.creditNotes += invoice.tipoDte === "61" ? 1 : 0;
    row.total += sign * invoice.montoTotal;
    row.iva += sign * invoice.iva;
    row.totalClp = formatClp(row.total);
    row.ivaClp = formatClp(row.iva);
    map.set(key, row);
  }

  for (const invoice of invoices) {
    addSummary(byDay, invoice.fechaEmision, invoice);
    addSummary(byMonth, monthKey(invoice.fechaEmision), invoice);
    addSummary(byYear, invoice.fechaEmision.slice(0, 4), invoice);

    const supplier = suppliers.get(invoice.rutEmisor) ?? {
      documents: 0,
      razonSocial: invoice.razonSocialEmisor,
      rut: invoice.rutEmisor,
      total: 0,
      totalClp: formatClp(0)
    };
    supplier.documents += 1;
    supplier.total += invoice.tipoDte === "61" ? -invoice.montoTotal : invoice.montoTotal;
    supplier.totalClp = formatClp(supplier.total);
    suppliers.set(invoice.rutEmisor, supplier);

    for (const item of invoice.items) {
      if (item.validationStatus && item.validationStatus !== "valid" && (item.priceConfidenceScore ?? 0) < 70) {
        continue;
      }
      const product = products.get(item.description) ?? {
        description: item.description,
        documents: 0,
        lastPrices: [],
        quantity: 0,
        total: 0,
        totalClp: formatClp(0)
      };
      product.documents += 1;
      product.quantity += item.quantity;
      product.total += item.lineTotal;
      product.totalClp = formatClp(product.total);
      product.lastPrices.push({
        date: invoice.fechaEmision,
        folio: invoice.folio,
        supplier: invoice.razonSocialEmisor,
        unitPrice: item.unitPrice
      });
      product.lastPrices.sort((a, b) => b.date.localeCompare(a.date));
      product.lastPrices = product.lastPrices.slice(0, 3);
      products.set(item.description, product);
    }
  }

  const sortSummary = (rows: DtePurchaseData["summaries"]["byMonth"]) =>
    rows.sort((a, b) => b.key.localeCompare(a.key));

  return {
    byDay: sortSummary([...byDay.values()]),
    byMonth: sortSummary([...byMonth.values()]),
    byYear: sortSummary([...byYear.values()]),
    products: [...products.values()].sort((a, b) => b.total - a.total),
    suppliers: [...suppliers.values()].sort((a, b) => b.total - a.total)
  };
}

export async function getDtePurchaseData(): Promise<DtePurchaseData> {
  noStore();
  if (!hasSupabaseAdminConfig()) {
    return purchasesData;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dte_documents")
    .select("id,tipo_dte,folio,rut_emisor,razon_social_emisor,rut_receptor,razon_social_receptor,fecha_emision,fecha_vencimiento,monto_neto,monto_exento,iva,monto_total,idempotency_key,dte_items(line_number,name,description,item_description_raw,quantity,unit,unit_price,line_total,item_validation_status,price_confidence_score)")
    .order("fecha_emision", { ascending: false })
    .limit(1000);

  if (error || !data?.length) {
    return purchasesData;
  }

  const invoices = (data as DteRow[]).map(toInvoice);
  return {
    generatedAt: new Date().toISOString(),
    invoiceCount: invoices.length,
    invoices,
    summaries: summarize(invoices)
  };
}
