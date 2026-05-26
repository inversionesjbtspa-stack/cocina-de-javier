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
};

export async function getDteOperationalInvoices(): Promise<DteOperationalInvoice[]> {
  noStore();
  if (!hasSupabaseAdminConfig()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dte_documents")
    .select("id,folio,tipo_dte,rut_emisor,razon_social_emisor,fecha_emision,fecha_recepcion,gmail_received_at,monto_neto,iva,monto_total,status,validation_status,gmail_message_id,source_type,xml_status,payment_status,dte_items(name),accounts_payable(status)")
    .order("fecha_recepcion", { ascending: false })
    .limit(1200);

  return (data ?? []).map((row) => {
    const payables = row.accounts_payable as Array<{ status: string }> | undefined;
    return {
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
  });
}
