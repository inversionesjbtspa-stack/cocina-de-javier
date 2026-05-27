import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminConfig } from "@/lib/env";

export type DteOperationalInvoice = {
  id: string;
  folio: string;
  tipoDte: string;
  supplier: string;
  rut: string;
  issuedAt: string;
  receivedAt: string;
  net: number;
  iva: number;
  total: number;
  xmlStatus: string;
  paymentStatus: string;
  itemNames: string[];
  gmailMessageId: string | null;
  sourceType: string;
  siiRegistryId?: string | null;
  claimStatus?: string | null;
};

type SiiRegistryInvoiceRow = {
  id: string;
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

type ManualPayableInvoiceRow = {
  id: string;
  document_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: string;
  payment_status?: string | null;
  source_type?: string | null;
  xml_status?: string | null;
  suppliers?: { rut: string; legal_name: string | null; trade_name: string | null } | Array<{ rut: string; legal_name: string | null; trade_name: string | null }>;
};

function keyOf(rut: string, tipoDte: string, folio: string) {
  return `${rut.replace(/[.\-\s]/g, "").toUpperCase()}:${tipoDte}:${folio}`.toUpperCase();
}

export async function getDteOperationalInvoices(): Promise<DteOperationalInvoice[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dte_documents")
    .select("id,folio,tipo_dte,rut_emisor,razon_social_emisor,fecha_emision,fecha_recepcion,gmail_received_at,monto_neto,iva,monto_total,status,validation_status,gmail_message_id,source_type,xml_status,payment_status,dte_items(name),accounts_payable(status)")
    .order("fecha_recepcion", { ascending: false })
    .limit(1200);

  const byKey = new Map<string, DteOperationalInvoice>();
  for (const row of (data ?? [])) {
    const payables = row.accounts_payable as Array<{ status: string }> | undefined;
    const invoice = {
      folio: row.folio,
      gmailMessageId: row.gmail_message_id,
      id: row.id,
      issuedAt: row.fecha_emision,
      itemNames: ((row.dte_items ?? []) as Array<{ name: string | null }>).map((item) => item.name ?? ""),
      iva: Number(row.iva ?? 0),
      net: Number(row.monto_neto ?? 0),
      paymentStatus: payables?.[0]?.status ?? "sin_cuenta_por_pagar",
      receivedAt: row.gmail_received_at ?? row.fecha_recepcion,
      rut: row.rut_emisor,
      supplier: row.razon_social_emisor ?? row.rut_emisor,
      tipoDte: row.tipo_dte,
      total: Number(row.monto_total ?? 0),
      sourceType: row.source_type ?? "xml",
      xmlStatus: row.xml_status === "missing" ? "pendiente_xml" : row.validation_status ?? row.status
    };
    byKey.set(keyOf(invoice.rut, invoice.tipoDte, invoice.folio), invoice);
  }

  const { data: registryRows } = await supabase
    .from("sii_purchase_registry")
    .select("id,rut_emisor,proveedor,razon_social,tipo_dte,folio,fecha_emision,monto_neto,iva,monto_total,estado_xml,payment_status,dte_document_id,provisional_dte_document_id,accounts_payable_id,claim_status")
    .or("estado_xml.eq.falta_xml,dte_document_id.is.null")
    .order("fecha_emision", { ascending: false })
    .limit(1200);

  for (const row of ((registryRows ?? []) as SiiRegistryInvoiceRow[])) {
    const key = keyOf(row.rut_emisor, String(row.tipo_dte), String(row.folio));
    if (byKey.has(key)) continue;
    byKey.set(key, {
      folio: String(row.folio),
      gmailMessageId: null,
      id: `sii-${row.id}`,
      issuedAt: row.fecha_emision ?? "",
      itemNames: [],
      iva: Number(row.iva ?? 0),
      net: Number(row.monto_neto ?? 0),
      paymentStatus: row.payment_status ?? (row.accounts_payable_id ? "en_tesoreria" : "pendiente"),
      receivedAt: row.fecha_emision ?? "",
      siiRegistryId: row.id,
      claimStatus: row.claim_status,
      rut: row.rut_emisor,
      sourceType: "sii",
      supplier: row.razon_social ?? row.proveedor ?? row.rut_emisor,
      tipoDte: String(row.tipo_dte),
      total: Number(row.monto_total ?? 0),
      xmlStatus: "pendiente_xml"
    });
  }

  const manualRich = await supabase
    .from("accounts_payable")
    .select("id,document_number,issue_date,due_date,subtotal,tax_amount,total_amount,status,payment_status,source_type,xml_status,suppliers(rut,legal_name,trade_name)")
    .eq("source_type", "manual")
    .order("issue_date", { ascending: false })
    .limit(1200);
  const manualLegacy = manualRich.error
    ? await supabase
      .from("accounts_payable")
      .select("id,document_number,issue_date,due_date,subtotal,tax_amount,total_amount,status,suppliers(rut,legal_name,trade_name)")
      .order("issue_date", { ascending: false })
      .limit(1200)
    : null;
  for (const row of (((manualRich.error ? manualLegacy?.data : manualRich.data) ?? []) as ManualPayableInvoiceRow[])) {
    if (manualRich.error && !String(row.document_number ?? "").toLowerCase().startsWith("manual-")) continue;
    if (!manualRich.error && row.source_type !== "manual") continue;
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
    const match = String(row.document_number).match(/^(.+?)-(.+)$/);
    const tipoDte = match?.[1] ?? "manual";
    const folio = match?.[2] ?? row.document_number;
    const rut = supplier?.rut ?? "";
    const key = keyOf(rut, tipoDte, folio);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      folio,
      gmailMessageId: null,
      id: `manual-${row.id}`,
      issuedAt: row.issue_date,
      itemNames: [],
      iva: Number(row.tax_amount ?? 0),
      net: Number(row.subtotal ?? 0),
      paymentStatus: row.payment_status ?? row.status,
      receivedAt: row.issue_date,
      rut,
      sourceType: "manual",
      supplier: supplier?.legal_name ?? supplier?.trade_name ?? "Factura manual",
      tipoDte,
      total: Number(row.total_amount ?? 0),
      xmlStatus: row.xml_status === "received" ? "recibido" : "pendiente_xml"
    });
  }

  return [...byKey.values()].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}
