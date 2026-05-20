import { NextResponse } from "next/server";
import { purchasesData } from "@/lib/dte/purchases-data";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function csvEscape(value: string | number) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const q = normalize(url.searchParams.get("q") ?? "");
  const month = url.searchParams.get("month") ?? "todos";
  const invoices = purchasesData.invoices.filter((invoice) => {
    const products = invoice.items.map((item) => item.description).join(" ");
    const haystack = normalize(`${invoice.razonSocialEmisor} ${invoice.rutEmisor} ${invoice.folio} ${invoice.montoTotal} ${invoice.fechaEmision} ${products}`);
    return (!q || haystack.includes(q)) && (month === "todos" || invoice.fechaEmision.startsWith(month));
  });
  const rows = [
    ["fecha", "rut", "proveedor", "tipo_dte", "folio", "neto", "iva", "total", "estado"],
    ...invoices.map((invoice) => [
      invoice.fechaEmision,
      invoice.rutEmisor,
      invoice.razonSocialEmisor,
      invoice.tipoDte,
      invoice.folio,
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
