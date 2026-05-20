import { NextResponse } from "next/server";
import { formatClp, formatDate, purchasesData, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type PdfInvoice = DtePurchaseInvoice & {
  metadata?: {
    formaPago?: string | null;
    termPagoGlosa?: string | null;
    giroEmisor?: string | null;
    dirOrigen?: string | null;
    cmnaOrigen?: string | null;
    ciudadOrigen?: string | null;
    giroReceptor?: string | null;
    dirReceptor?: string | null;
    cmnaReceptor?: string | null;
    ciudadReceptor?: string | null;
    tasaIva?: number | null;
    xmlSha256?: string | null;
    sourceFilename?: string | null;
    referenceCount?: number;
    taxCount?: number;
    globalDiscountCount?: number;
    hasTed?: boolean;
    hasCaf?: boolean;
  };
};

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

function invoiceType(invoice: PdfInvoice) {
  if (invoice.tipoDte === "61") {
    return "NOTA DE CREDITO ELECTRONICA";
  }
  if (invoice.tipoDte === "34") {
    return "FACTURA EXENTA ELECTRONICA";
  }
  return "FACTURA ELECTRONICA";
}

function generatePdf(invoice: PdfInvoice) {
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
    text(48, 591, `Forma pago: ${invoice.metadata?.formaPago ?? (invoice.paymentStatus === "paid" ? "Pagada" : "Pendiente")}`),
    bold(329, 635, "Receptor", 10),
    text(329, 619, truncate(invoice.razonSocialReceptor, 42)),
    text(329, 605, `RUT: ${invoice.rutReceptor}`),
    text(329, 591, "Operacion: La Cocina de Javier"),
    rect(38, 538, 536, 26, "0.43 0.09 0.16"),
    bold(48, 547, "Detalle de items XML", 10, "1 1 1"),
    text(48, 526, "Descripcion", 8),
    text(300, 526, "Cant.", 8),
    text(350, 526, "Unidad", 8),
    text(410, 526, "Precio", 8),
    text(500, 526, "Total", 8),
    line(38, 518, 574, 518)
  ];

  let y = 500;
  invoice.items.slice(0, 18).forEach((item, index) => {
    if (index % 2 === 0) {
      ops.push(rect(38, y - 5, 536, 18, "0.995 0.985 0.965"));
    }
    ops.push(text(48, y, truncate(item.description, 54), 8));
    ops.push(text(302, y, item.quantity.toLocaleString("es-CL"), 8));
    ops.push(text(350, y, item.unit || "UN", 8));
    ops.push(text(410, y, money(item.unitPrice), 8));
    ops.push(text(500, y, money(item.lineTotal), 8));
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
    text(48, 160, `Origen: Gmail DTE / ${invoice.metadata?.sourceFilename ?? "XML original en Supabase"}`),
    text(48, 144, `Hash SHA-256: ${invoice.metadata?.xmlSha256 ?? invoice.normalizedKey ?? "registrado en XML"}`),
    text(48, 128, `Referencias: ${invoice.metadata?.referenceCount ?? 0} · Impuestos adicionales: ${invoice.metadata?.taxCount ?? 0} · Desc/rec globales: ${invoice.metadata?.globalDiscountCount ?? 0}`),
    text(48, 112, `TED: ${invoice.metadata?.hasTed ? "informado" : "no informado"} · CAF: ${invoice.metadata?.hasCaf ? "informado" : "no informado"} · Tasa IVA: ${invoice.metadata?.tasaIva ?? 19}%`),
    text(48, 94, `Emisor: ${truncate([invoice.metadata?.giroEmisor, invoice.metadata?.dirOrigen, invoice.metadata?.cmnaOrigen].filter(Boolean).join(" / "), 86)}`, 7, "0.45 0.38 0.38"),
    text(48, 80, `Receptor: ${truncate([invoice.metadata?.giroReceptor, invoice.metadata?.dirReceptor, invoice.metadata?.cmnaReceptor].filter(Boolean).join(" / "), 86)}`, 7, "0.45 0.38 0.38")
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

async function getSupabaseInvoice(folio: string): Promise<PdfInvoice | null> {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dte_documents")
    .select("*,dte_items(line_number,name,description,item_description_raw,quantity,unit,unit_price,discount_amount,surcharge_amount,additional_tax_code,line_total,item_validation_status,price_confidence_score),dte_references(id),dte_taxes(id),dte_global_discounts(id)")
    .eq("folio", folio)
    .order("fecha_emision", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    documentType: invoiceType({ tipoDte: data.tipo_dte } as PdfInvoice),
    fechaEmision: data.fecha_emision,
    fechaVencimiento: data.fecha_vencimiento ?? data.fecha_emision,
    folio: data.folio,
    items: (data.dte_items ?? []).map((item: Record<string, unknown>) => ({
      description: String(item.name ?? item.description ?? "SIN DESCRIPCION XML"),
      detailDescription: item.item_description_raw ? String(item.item_description_raw) : null,
      lineNumber: Number(item.line_number ?? 0),
      lineTotal: Number(item.line_total ?? 0),
      quantity: Number(item.quantity ?? 0),
      unit: String(item.unit ?? "UN"),
      unitPrice: Number(item.unit_price ?? 0)
    })),
    metadata: {
      cmnaOrigen: data.cmna_origen,
      cmnaReceptor: data.cmna_receptor,
      ciudadOrigen: data.ciudad_origen,
      ciudadReceptor: data.ciudad_receptor,
      dirOrigen: data.dir_origen,
      dirReceptor: data.dir_receptor,
      formaPago: data.forma_pago,
      giroEmisor: data.giro_emisor,
      giroReceptor: data.giro_receptor,
      globalDiscountCount: data.dte_global_discounts?.length ?? 0,
      hasCaf: Boolean(data.caf_json),
      hasTed: Boolean(data.ted_json),
      referenceCount: data.dte_references?.length ?? 0,
      sourceFilename: data.gmail_filename,
      tasaIva: data.tasa_iva,
      taxCount: data.dte_taxes?.length ?? 0,
      termPagoGlosa: data.term_pago_glosa,
      xmlSha256: data.xml_sha256
    },
    montoExento: Number(data.monto_exento ?? 0),
    montoNeto: Number(data.monto_neto ?? 0),
    montoTotal: Number(data.monto_total ?? 0),
    normalizedKey: data.idempotency_key,
    paymentStatus: "Pendiente",
    razonSocialEmisor: data.razon_social_emisor ?? data.rut_emisor,
    razonSocialReceptor: data.razon_social_receptor ?? data.rut_receptor,
    rutEmisor: data.rut_emisor,
    rutReceptor: data.rut_receptor,
    tipoDte: data.tipo_dte,
    iva: Number(data.iva ?? 0)
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ folio: string }> }
) {
  const { folio } = await params;
  const invoice = await getSupabaseInvoice(folio) ?? purchasesData.invoices.find((candidate) => candidate.folio === folio);

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
