import { NextResponse } from "next/server";
import { generateSantanderTemplate } from "@/lib/payments/santander-template";

export function GET(request: Request) {
  const url = new URL(request.url);
  const folios = url.searchParams
    .get("folios")
    ?.split(",")
    .map((folio) => folio.trim())
    .filter(Boolean) ?? [];

  const result = generateSantanderTemplate(folios);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "payment_validation_failed",
        invalid: result.invalid.map((item) => ({
          alerts: item.alerts,
          folio: item.invoice.folio,
          proveedor: item.invoice.razonSocialEmisor,
          rut: item.invoice.rutEmisor
        }))
      },
      { status: 422 }
    );
  }

  return new NextResponse(result.buffer, {
    headers: {
      "Content-Disposition": 'attachment; filename="Template Pagos JESUS - nomina ERP.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Payment-Rows": String(result.rows.length)
    }
  });
}
