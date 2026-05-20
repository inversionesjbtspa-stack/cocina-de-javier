import { NextResponse } from "next/server";
import { enrichedSuppliers } from "@/lib/suppliers/master";

function csvEscape(value: string | number) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function GET(request: Request) {
  const filter = new URL(request.url).searchParams.get("filter");
  const suppliers = enrichedSuppliers().filter((supplier) => {
    if (filter === "sin-banco") return !supplier.bankCode || !supplier.bankAccount;
    if (filter === "sin-email") return !supplier.email;
    if (filter === "deuda") return supplier.pending > 0;
    if (filter === "duplicados") return false;
    return true;
  });
  const rows = [
    ["rut", "razon_social", "banco", "cuenta", "email", "telefono", "deuda", "facturas", "alertas"],
    ...suppliers.map((supplier) => [
      supplier.rut,
      supplier.businessName,
      supplier.bankName,
      supplier.bankAccount,
      supplier.email,
      supplier.phone,
      supplier.pending,
      supplier.documents,
      supplier.validation.alerts.join(", ")
    ])
  ];

  return new NextResponse(rows.map((row) => row.map(csvEscape).join(";")).join("\n"), {
    headers: {
      "Content-Disposition": `attachment; filename="proveedores-${filter ?? "todos"}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
