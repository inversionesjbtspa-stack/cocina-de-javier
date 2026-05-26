import { NextResponse } from "next/server";
import { getUnifiedPurchasesByMonth } from "@/lib/dte/supabase-data";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function csvEscape(value: string | number) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = normalize(url.searchParams.get("q") ?? "");
  const month = url.searchParams.get("month") ?? "todos";
  const origin = url.searchParams.get("origin") ?? "todos";
  const xmlStatus = url.searchParams.get("xmlStatus") ?? "todos";
  const data = await getUnifiedPurchasesByMonth();
  const invoices = data.invoices.filter((invoice) => {
    const products = invoice.items.map((item) => item.description).join(" ");
    const haystack = normalize(`${invoice.razonSocialEmisor} ${invoice.rutEmisor} ${invoice.folio} ${invoice.montoTotal} ${invoice.fechaEmision} ${invoice.tipoDte} ${invoice.sourceLabel ?? ""} ${invoice.paymentStatus} ${products}`);
    const matchesOrigin = origin === "todos" || invoice.source === origin;
    const matchesXml =
      xmlStatus === "todos" ||
      (xmlStatus === "received" && invoice.xmlStatus !== "missing") ||
      (xmlStatus === "missing" && invoice.xmlStatus === "missing");
    return (!q || haystack.includes(q)) &&
      (month === "todos" || invoice.fechaEmision.startsWith(month)) &&
      matchesOrigin &&
      matchesXml;
  });
  const rows = [
    ["fecha", "rut", "proveedor", "tipo_dte", "folio", "origen", "estado_xml", "neto", "iva", "total", "estado_pago"],
    ...invoices.map((invoice) => [
      invoice.fechaEmision,
      invoice.rutEmisor,
      invoice.razonSocialEmisor,
      invoice.tipoDte,
      invoice.folio,
      invoice.source === "sii" ? "SII" : "XML",
      invoice.xmlStatus === "missing" ? "Pendiente XML" : "Recibido",
      invoice.montoNeto,
      invoice.iva,
      invoice.montoTotal,
      invoice.paymentStatus
    ])
  ];

  return new NextResponse(rows.map((row) => row.map(csvEscape).join(";")).join("\n"), {
    headers: {
      "Content-Disposition": 'attachment; filename="compras-filtradas.csv"',
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
