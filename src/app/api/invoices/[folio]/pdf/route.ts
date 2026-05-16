import { NextResponse } from "next/server";
import { formatClp, purchasesData } from "@/lib/dte/purchases-data";

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function generatePdf(invoice: (typeof purchasesData.invoices)[number]) {
  const lines = [
    "LA COCINA DE JAVIER",
    "REPRESENTACION PDF DESDE XML DTE",
    `${invoice.documentType} ${invoice.folio}`,
    `Fecha: ${invoice.fechaEmision}`,
    `Proveedor: ${invoice.razonSocialEmisor}`,
    `RUT proveedor: ${invoice.rutEmisor}`,
    `Receptor: ${invoice.razonSocialReceptor}`,
    `RUT receptor: ${invoice.rutReceptor}`,
    `Neto: ${formatClp(invoice.montoNeto)}`,
    `IVA: ${formatClp(invoice.iva)}`,
    `Monto total: ${formatClp(invoice.montoTotal)}`,
    "",
    "Detalle:",
    ...invoice.items.map(
      (item) =>
        `${item.description} | Cantidad: ${item.quantity.toLocaleString("es-CL")} | Precio: ${formatClp(item.unitPrice)} | Total: ${formatClp(item.lineTotal)}`
    )
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F1 16 Tf" : "/F1 10 Tf",
      `(${pdfEscape(line)}) Tj`,
      "0 -18 Td"
    ]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ folio: string }> }
) {
  const { folio } = await params;
  const invoice = purchasesData.invoices.find((candidate) => candidate.folio === folio);

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "invoice_not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";

  return new NextResponse(generatePdf(invoice), {
    headers: {
      "Content-Disposition": `${disposition}; filename="${invoice.documentType}-${invoice.folio}.pdf"`,
      "Content-Type": "application/pdf"
    }
  });
}
