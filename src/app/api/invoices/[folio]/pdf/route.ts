import { NextResponse } from "next/server";
import { formatClp, formatDate, purchasesData, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value: number) {
  return formatClp(value).replace(/\$/g, "CLP ");
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}.` : value;
}

function text(x: number, y: number, value: string, size = 9, color = "0.18 0.10 0.12") {
  return `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
}

function bold(x: number, y: number, value: string, size = 10, color = "0.43 0.09 0.16") {
  return `${color} rg BT /F2 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
}

function rect(x: number, y: number, width: number, height: number, fill: string) {
  return `${fill} rg ${x} ${y} ${width} ${height} re f`;
}

function line(x1: number, y1: number, x2: number, y2: number, color = "0.88 0.82 0.79") {
  return `${color} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function invoiceType(invoice: DtePurchaseInvoice) {
  if (invoice.tipoDte === "61") {
    return "NOTA DE CREDITO ELECTRONICA";
  }
  if (invoice.tipoDte === "34") {
    return "FACTURA EXENTA ELECTRONICA";
  }
  return "FACTURA ELECTRONICA";
}

function generatePdf(invoice: DtePurchaseInvoice) {
  const ops: string[] = [
    rect(0, 760, 612, 82, "0.43 0.09 0.16"),
    rect(38, 672, 536, 70, "1 0.98 0.95"),
    rect(390, 682, 164, 50, "1 1 1"),
    rect(38, 585, 255, 70, "1 1 1"),
    rect(319, 585, 255, 70, "1 1 1"),
    rect(390, 132, 164, 86, "1 0.98 0.95"),
    bold(48, 805, "LA COCINA DE JAVIER", 17, "1 1 1"),
    text(48, 786, "Representacion corporativa generada desde XML DTE original", 9, "0.96 0.90 0.86"),
    text(48, 771, "Documento contable para revision interna, auditoria y pago", 8, "0.96 0.90 0.86"),
    bold(405, 715, invoiceType(invoice), 9),
    bold(405, 699, `RUT ${invoice.rutEmisor}`, 9),
    bold(405, 683, `FOLIO ${invoice.folio}`, 13),
    bold(48, 720, "Datos tributarios", 11),
    text(48, 702, `Tipo DTE: ${invoice.tipoDte}`),
    text(48, 688, `Fecha emision: ${formatDate(invoice.fechaEmision)}`),
    text(48, 674, `Vencimiento: ${formatDate(invoice.fechaVencimiento)}`),
    bold(48, 635, "Emisor", 10),
    text(48, 619, truncate(invoice.razonSocialEmisor, 42)),
    text(48, 605, `RUT: ${invoice.rutEmisor}`),
    text(48, 591, `Forma pago: ${invoice.paymentStatus === "paid" ? "Pagada" : "Pendiente"}`),
    bold(329, 635, "Receptor", 10),
    text(329, 619, truncate(invoice.razonSocialReceptor, 42)),
    text(329, 605, `RUT: ${invoice.rutReceptor}`),
    text(329, 591, "Operacion: La Cocina de Javier"),
    rect(38, 538, 536, 26, "0.43 0.09 0.16"),
    bold(48, 547, "Detalle de items XML", 10, "1 1 1"),
    text(48, 526, "Descripcion", 8),
    text(330, 526, "Cant.", 8),
    text(390, 526, "Precio", 8),
    text(488, 526, "Total", 8),
    line(38, 518, 574, 518)
  ];

  let y = 500;
  invoice.items.slice(0, 18).forEach((item, index) => {
    if (index % 2 === 0) {
      ops.push(rect(38, y - 5, 536, 18, "0.995 0.985 0.965"));
    }
    ops.push(text(48, y, truncate(item.description, 54), 8));
    ops.push(text(332, y, item.quantity.toLocaleString("es-CL"), 8));
    ops.push(text(390, y, money(item.unitPrice), 8));
    ops.push(text(488, y, money(item.lineTotal), 8));
    y -= 20;
  });

  if (invoice.items.length > 18) {
    ops.push(text(48, y, `Mas items disponibles en XML original: ${invoice.items.length - 18}`, 8, "0.43 0.09 0.16"));
  }

  ops.push(
    line(390, 205, 554, 205),
    text(405, 194, "Monto neto", 9),
    bold(488, 194, money(invoice.montoNeto), 9),
    text(405, 176, "Monto exento", 9),
    bold(488, 176, money(invoice.montoExento), 9),
    text(405, 158, "IVA", 9),
    bold(488, 158, money(invoice.iva), 9),
    rect(390, 132, 164, 24, "0.43 0.09 0.16"),
    bold(405, 140, "TOTAL", 10, "1 1 1"),
    bold(488, 140, money(invoice.montoTotal), 10, "1 1 1"),
    bold(48, 194, "Trazabilidad XML", 10),
    text(48, 176, `Clave idempotente: ${invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}`),
    text(48, 160, "Origen: Gmail DTE / Supabase Storage privado"),
    text(48, 144, "Estado tributario: XML parseado y documento generado"),
    text(48, 120, "Este PDF conserva la lectura operativa del XML. El XML original es el documento fuente auditable.", 7, "0.45 0.38 0.38")
  );

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
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
