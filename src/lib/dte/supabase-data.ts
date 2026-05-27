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
  source_type: string | null;
  xml_status: string | null;
  payment_status: string | null;
  sii_purchase_registry_id: string | null;
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

type SiiRegistryRow = {
  id: string;
  periodo: string | null;
  rut_emisor: string;
  proveedor: string | null;
  razon_social: string | null;
  tipo_dte: string;
  folio: string;
  fecha_emision: string | null;
  monto_neto: number | null;
  iva: number | null;
  monto_total: number | null;
  estado_xml: string | null;
  payment_status: string | null;
  dte_document_id: string | null;
  provisional_dte_document_id: string | null;
  accounts_payable_id: string | null;
  claim_status: string | null;
};

type ManualPayableRow = {
  id: string;
  document_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  balance_amount: number | null;
  status: string;
  payment_status?: string | null;
  source_type?: string | null;
  xml_status?: string | null;
  suppliers?: {
    rut: string;
    legal_name: string | null;
    trade_name: string | null;
  } | Array<{
    rut: string;
    legal_name: string | null;
    trade_name: string | null;
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

function normalizeKey(rut: string, tipoDte: string, folio: string) {
  return `${rut.replace(/[.\-\s]/g, "").toUpperCase()}:${tipoDte}:${folio}`.toUpperCase();
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
    accountsPayableId: null,
    documentType: documentType(row.tipo_dte),
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento ?? row.fecha_emision,
    folio: row.folio,
    id: row.id,
    items,
    montoExento: toNumber(row.monto_exento),
    montoNeto: toNumber(row.monto_neto),
    montoTotal: toNumber(row.monto_total),
    normalizedKey: normalizeKey(row.rut_emisor, row.tipo_dte, row.folio),
    paymentStatus: row.payment_status ?? "Pendiente",
    razonSocialEmisor: row.razon_social_emisor ?? row.rut_emisor,
    razonSocialReceptor: row.razon_social_receptor ?? row.rut_receptor,
    rutEmisor: row.rut_emisor,
    rutReceptor: row.rut_receptor,
    siiRegistryId: row.sii_purchase_registry_id,
    source: row.source_type === "sii" ? "sii" : "xml",
    sourceLabel: row.source_type === "sii" ? "SII" : "XML",
    tipoDte: row.tipo_dte,
    iva: toNumber(row.iva),
    xmlStatus: row.xml_status === "missing" ? "missing" : "received"
  };
}

function toSiiInvoice(row: SiiRegistryRow): DtePurchaseInvoice {
  const issueDate = row.fecha_emision ?? `${row.periodo ?? "2026-05"}-01`;
  const supplier = row.razon_social ?? row.proveedor ?? row.rut_emisor;

  return {
    accountsPayableId: row.accounts_payable_id,
    documentType: documentType(String(row.tipo_dte)),
    fechaEmision: issueDate,
    fechaVencimiento: issueDate,
    folio: String(row.folio),
    items: [],
    montoExento: 0,
    montoNeto: toNumber(row.monto_neto),
    montoTotal: toNumber(row.monto_total),
    normalizedKey: normalizeKey(row.rut_emisor, String(row.tipo_dte), String(row.folio)),
    paymentStatus: row.payment_status ?? (row.accounts_payable_id ? "En tesoreria" : "Pendiente"),
    claimStatus: row.claim_status,
    razonSocialEmisor: supplier,
    razonSocialReceptor: "La Cocina de Javier",
    rutEmisor: row.rut_emisor,
    rutReceptor: "",
    siiRegistryId: row.id,
    source: "sii",
    sourceLabel: "SII",
    tipoDte: String(row.tipo_dte),
    iva: toNumber(row.iva),
    xmlStatus: "missing"
  };
}

function splitDocumentNumber(documentNumber: string) {
  const match = String(documentNumber).match(/^(.+?)-(.+)$/);
  return {
    folio: match?.[2] ?? documentNumber,
    tipoDte: match?.[1] ?? "manual"
  };
}

function toManualInvoice(row: ManualPayableRow): DtePurchaseInvoice {
  const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
  const split = splitDocumentNumber(row.document_number);
  const supplierRut = supplier?.rut ?? "";
  const supplierName = supplier?.legal_name ?? supplier?.trade_name ?? "Factura manual";
  const tax = toNumber(row.tax_amount);
  const total = toNumber(row.total_amount);

  return {
    accountsPayableId: row.id,
    documentType: split.tipoDte === "manual" ? "Factura manual" : documentType(split.tipoDte),
    fechaEmision: row.issue_date,
    fechaVencimiento: row.due_date,
    folio: split.folio,
    items: [],
    montoExento: 0,
    montoNeto: toNumber(row.subtotal) || Math.max(0, total - tax),
    montoTotal: total,
    normalizedKey: normalizeKey(supplierRut, split.tipoDte, split.folio),
    paymentStatus: row.payment_status ?? row.status,
    razonSocialEmisor: supplierName,
    razonSocialReceptor: "La Cocina de Javier",
    rutEmisor: supplierRut,
    rutReceptor: "",
    source: "manual",
    sourceLabel: "Manual",
    tipoDte: split.tipoDte,
    iva: tax,
    xmlStatus: row.xml_status === "received" ? "received" : "missing"
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
  return getUnifiedPurchasesByMonth();
}

export async function getUnifiedPurchasesByMonth(): Promise<DtePurchaseData> {
  noStore();
  if (!hasSupabaseAdminConfig()) {
    return purchasesData;
  }

  const supabase = createAdminClient();
  const diagnostics: NonNullable<DtePurchaseData["diagnostics"]> = {
    dteRows: 0,
    errors: [],
    finalUnifiedRows: 0,
    manualRows: 0,
    manualRowsDiscarded: 0,
    siiRows: 0,
    siiRowsDiscardedByDedup: 0,
    siiRowsDiscardedByPeriod: 0
  };
  const { data: dteRows, error } = await supabase
    .from("dte_documents")
    .select("id,source_type,xml_status,payment_status,sii_purchase_registry_id,tipo_dte,folio,rut_emisor,razon_social_emisor,rut_receptor,razon_social_receptor,fecha_emision,fecha_vencimiento,monto_neto,monto_exento,iva,monto_total,idempotency_key,dte_items(line_number,name,description,item_description_raw,quantity,unit,unit_price,line_total,item_validation_status,price_confidence_score)")
    .order("fecha_emision", { ascending: false })
    .limit(5000);
  if (error) diagnostics.errors.push(`dte_documents: ${error.message}`);
  diagnostics.dteRows = dteRows?.length ?? 0;

  const byKey = new Map<string, DtePurchaseInvoice>();
  for (const invoice of ((dteRows ?? []) as DteRow[]).map(toInvoice)) {
    byKey.set(invoice.normalizedKey ?? normalizeKey(invoice.rutEmisor, invoice.tipoDte, invoice.folio), invoice);
  }

  const registryResult = await supabase
    .from("sii_purchase_registry")
    .select("id,periodo,rut_emisor,proveedor,razon_social,tipo_dte,folio,fecha_emision,monto_neto,iva,monto_total,estado_xml,payment_status,dte_document_id,provisional_dte_document_id,accounts_payable_id,claim_status")
    .order("fecha_emision", { ascending: false })
    .limit(5000);
  if (registryResult.error) diagnostics.errors.push(`sii_purchase_registry: ${registryResult.error.message}`);
  const registryData = registryResult.data;
  diagnostics.siiRows = registryData?.length ?? 0;

  for (const row of ((registryData ?? []) as SiiRegistryRow[])) {
    const invoice = toSiiInvoice(row);
    const key = invoice.normalizedKey ?? normalizeKey(invoice.rutEmisor, invoice.tipoDte, invoice.folio);
    if (!byKey.has(key)) {
      byKey.set(key, invoice);
    } else {
      diagnostics.siiRowsDiscardedByDedup += 1;
    }
  }

  const manualResult = await supabase
    .from("accounts_payable")
    .select("id,document_number,issue_date,due_date,subtotal,tax_amount,total_amount,balance_amount,status,payment_status,source_type,xml_status,suppliers(rut,legal_name,trade_name)")
    .eq("source_type", "manual")
    .order("issue_date", { ascending: false })
    .limit(5000);
  if (manualResult.error) diagnostics.errors.push(`accounts_payable.manual: ${manualResult.error.message}`);
  const manualRows = (manualResult.data ?? []) as ManualPayableRow[];
  diagnostics.manualRows = manualRows.length;
  for (const row of manualRows) {
    const record = row as Record<string, unknown>;
    if (record.source_type !== "manual") {
      diagnostics.manualRowsDiscarded += 1;
      continue;
    }
    const invoice = toManualInvoice(row);
    const key = invoice.normalizedKey ?? normalizeKey(invoice.rutEmisor, invoice.tipoDte, invoice.folio);
    if (!byKey.has(key)) {
      byKey.set(key, invoice);
    } else {
      diagnostics.manualRowsDiscarded += 1;
    }
  }

  const invoices = [...byKey.values()].sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
  diagnostics.finalUnifiedRows = invoices.length;
  if (!invoices.length) {
    return purchasesData;
  }

  return {
    diagnostics,
    generatedAt: new Date().toISOString(),
    invoiceCount: invoices.length,
    invoices,
    summaries: summarize(invoices)
  };
}
