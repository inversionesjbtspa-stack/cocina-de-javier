import { NextResponse } from "next/server";
import { productAnalytics } from "@/lib/finance/enterprise-analytics";
import { purchasesData } from "@/lib/dte/purchases-data";

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

export function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type") ?? "price-history";
  const products = productAnalytics(500);
  let rows: Array<Array<string | number>>;

  if (type === "duplicates") {
    const grouped = new Map<string, number>();
    purchasesData.summaries.products.forEach((product) => {
      const key = product.description.trim().toLowerCase();
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });
    rows = [["descripcion", "duplicados"], ...[...grouped.entries()].filter(([, count]) => count > 1)];
  } else if (type === "price-alerts") {
    rows = [
      ["producto", "riesgo", "variacion", "ultimo_precio", "mejor_precio", "proveedor_ultimo"],
      ...products
        .filter((product) => product.risk !== "success")
        .map((product) => [
          product.description,
          product.risk,
          product.variation.toFixed(2),
          product.last?.unitPrice ?? 0,
          product.best?.unitPrice ?? 0,
          product.last?.supplier ?? ""
        ])
    ];
  } else if (type === "monthly-comparison") {
    rows = [
      ["mes", "documentos", "facturas", "notas_credito", "total", "iva"],
      ...purchasesData.summaries.byMonth.map((row) => [
        row.key,
        row.documents,
        row.invoices,
        row.creditNotes,
        row.total,
        row.iva
      ])
    ];
  } else {
    rows = [
      ["producto", "fecha", "folio", "proveedor", "precio_unitario"],
      ...products.flatMap((product) =>
        product.lastPrices.map((price) => [
          product.description,
          price.date,
          price.folio,
          price.supplier,
          price.unitPrice
        ])
      )
    ];
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Disposition": `attachment; filename="productos-${type}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
