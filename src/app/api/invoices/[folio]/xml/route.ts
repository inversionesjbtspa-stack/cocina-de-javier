import { NextResponse } from "next/server";
import { purchasesData } from "@/lib/dte/purchases-data";

function esc(value: string | number) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ folio: string }> }
) {
  const { folio } = await params;
  const invoice = purchasesData.invoices.find((item) => item.folio === folio);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "invoice_not_found" }, { status: 404 });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DTEResumen fuente="ERP La Cocina de Javier">
  <Documento tipoDTE="${esc(invoice.tipoDte)}" folio="${esc(invoice.folio)}">
    <Emisor rut="${esc(invoice.rutEmisor)}">${esc(invoice.razonSocialEmisor)}</Emisor>
    <Receptor rut="${esc(invoice.rutReceptor)}">${esc(invoice.razonSocialReceptor)}</Receptor>
    <FechaEmision>${esc(invoice.fechaEmision)}</FechaEmision>
    <FechaVencimiento>${esc(invoice.fechaVencimiento)}</FechaVencimiento>
    <Totales>
      <Neto>${invoice.montoNeto}</Neto>
      <Exento>${invoice.montoExento}</Exento>
      <IVA>${invoice.iva}</IVA>
      <Total>${invoice.montoTotal}</Total>
    </Totales>
    <Items>
${invoice.items.map((item) => `      <Item linea="${item.lineNumber}" unidad="${esc(item.unit)}"><Descripcion>${esc(item.description)}</Descripcion><Cantidad>${item.quantity}</Cantidad><Precio>${item.unitPrice}</Precio><Total>${item.lineTotal}</Total></Item>`).join("\n")}
    </Items>
    <IdempotencyKey>${esc(invoice.normalizedKey ?? "")}</IdempotencyKey>
  </Documento>
</DTEResumen>
`;

  return new NextResponse(xml, {
    headers: {
      "Content-Disposition": `attachment; filename="DTE-${invoice.tipoDte}-${invoice.folio}.xml"`,
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
