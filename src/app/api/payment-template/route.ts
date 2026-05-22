import { NextResponse } from "next/server";
import { generateSantanderTemplate, generateSantanderTemplateFromPayables } from "@/lib/payments/santander-template";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payableIds = url.searchParams.get("payableIds")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const folios = url.searchParams
    .get("folios")
    ?.split(",")
    .map((folio) => folio.trim())
    .filter(Boolean) ?? [];

  const result = payableIds.length ? await generateSantanderTemplateFromPayables(payableIds, url.searchParams.get("payDate") ?? undefined) : generateSantanderTemplate(folios);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "payment_validation_failed",
        invalid: result.invalid.map((item) => ({
          alerts: item.alerts,
          folio: "invoice" in item ? item.invoice.folio : item.id,
          proveedor: "invoice" in item ? item.invoice.razonSocialEmisor : "Cuenta por pagar",
          rut: "invoice" in item ? item.invoice.rutEmisor : ""
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
