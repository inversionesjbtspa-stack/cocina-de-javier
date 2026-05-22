import { NextResponse } from "next/server";
import {
  formatClp,
  formatDate,
  purchasesData,
  type DtePurchaseInvoice,
  type DtePurchaseItem
} from "@/lib/dte/purchases-data";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type PdfItem = DtePurchaseItem & {
  additionalTaxCode?: string | null;
  discountAmount?: number;
  surchargeAmount?: number;
};

type PdfInvoice = Omit<DtePurchaseInvoice, "items"> & {
  items: PdfItem[];
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
    globalDiscountCount?: number;
    hasTed?: boolean;
    hasCaf?: boolean;
    references?: Array<{ folio?: string | null; type?: string | null; reason?: string | null }>;
    taxes?: Array<{ code?: string | null; rate?: number | null; amount: number; lineNumber?: number | null }>;
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

function invoiceType(invoice: Pick<PdfInvoice, "tipoDte">) {
  if (invoice.tipoDte === "61") {
    return "NOTA DE CREDITO ELECTRONICA";
  }
  if (invoice.tipoDte === "34") {
    return "FACTURA EXENTA ELECTRONICA";
  }
  return "FACTURA ELECTRONICA";
}

function pageHeader(invoice: PdfInvoice, page: number, pageCount: number) {
  return [
    rect(0, 760, 612, 82, "0.43 0.09 0.16"),
    rect(38, 672, 536, 70, "1 0.98 0.95"),
    rect(390, 682, 164, 50, "1 1 1"),
    rect(38, 585, 255, 70, "1 1 1"),
    rect(319, 585, 255, 70, "1 1 1"),
    bold(48, 805, "LA COCINA DE JAVIER", 17, "1 1 1"),
    text(48, 786, "Representacion contable generada desde XML DTE original", 9, "0.96 0.90 0.86"),
    text(48, 771, `Pagina ${page} de ${pageCount}`, 8, "0.96 0.90 0.86"),
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
    text(48, 591, truncate(`Giro: ${invoice.metadata?.giroEmisor ?? "No informado en XML"}`, 42)),
    bold(329, 635, "Receptor", 10),
    text(329, 619, truncate(invoice.razonSocialReceptor, 42)),
    text(329, 605, `RUT: ${invoice.rutReceptor}`),
    text(329, 591, truncate(`Direccion: ${invoice.metadata?.dirReceptor ?? "No informado en XML"}`, 42)),
    rect(38, 538, 536, 26, "0.43 0.09 0.16"),
    bold(48, 547, "Detalle de items XML", 10, "1 1 1"),
    text(48, 526, "Producto / descripcion", 7),
    text(286, 526, "Cant.", 7),
    text(326, 526, "Un.", 7),
    text(361, 526, "P.Unit.", 7),
    text(426, 526, "Desc/Rec.", 7),
    text(486, 526, "Imp.", 7),
    text(528, 526, "Total", 7),
    line(38, 518, 574, 518)
  ];
}

function pagesForInvoice(invoice: PdfInvoice) {
  const chunks: PdfInvoice["items"][] = [];
  for (let index = 0; index < invoice.items.length; index += 12) {
    chunks.push(invoice.items.slice(index, index + 12));
  }
  if (!chunks.length) {
    chunks.push([]);
  }

  return chunks.map((items, index) => {
    const finalPage = index === chunks.length - 1;
    const ops = pageHeader(invoice, index + 1, chunks.length);
    let y = 500;
    items.forEach((item, itemIndex) => {
      if (itemIndex % 2 === 0) {
        ops.push(rect(38, y - 5, 536, 18, "0.995 0.985 0.965"));
      }
      const detail =
        item.detailDescription && item.detailDescription !== item.description
          ? ` / ${item.detailDescription}`
          : "";
      ops.push(text(48, y, truncate(`${item.description}${detail}`, 50), 7));
      ops.push(text(288, y, item.quantity.toLocaleString("es-CL"), 7));
      ops.push(text(326, y, truncate(item.unit || "UN", 6), 7));
      ops.push(text(361, y, money(item.unitPrice), 7));
      ops.push(text(426, y, `${money(item.discountAmount ?? 0)} / ${money(item.surchargeAmount ?? 0)}`, 6));
      ops.push(text(486, y, item.additionalTaxCode ?? "-", 7));
      ops.push(text(528, y, money(item.lineTotal), 7));
      y -= 20;
    });

    if (!finalPage) {
      ops.push(text(48, 230, "Detalle continua en la pagina siguiente.", 8, "0.43 0.09 0.16"));
      return ops.join("\n");
    }

    const taxTotal = (invoice.metadata?.taxes ?? [])
      .filter((tax) => !tax.lineNumber)
      .reduce((total, tax) => total + tax.amount, 0);
    ops.push(
      rect(390, 132, 164, 104, "1 0.98 0.95"),
      line(390, 218, 554, 218),
      text(405, 204, "Monto neto", 8),
      bold(488, 204, money(invoice.montoNeto), 8),
      text(405, 188, "Monto exento", 8),
      bold(488, 188, money(invoice.montoExento), 8),
      text(405, 172, "IVA", 8),
      bold(488, 172, money(invoice.iva), 8),
      text(405, 156, "Imp. adicional", 8),
      bold(488, 156, money(taxTotal), 8),
      rect(390, 132, 164, 20, "0.43 0.09 0.16"),
      bold(405, 139, "TOTAL", 9, "1 1 1"),
      bold(488, 139, money(invoice.montoTotal), 9, "1 1 1"),
      bold(48, 216, "Referencias e impuestos", 9),
      text(48, 200, truncate(`Referencias: ${(invoice.metadata?.references ?? []).map((ref) => `${ref.type ?? "DTE"} ${ref.folio ?? ""}`).join(" / ") || "No informadas en XML"}`, 82), 7),
      text(48, 186, truncate(`Impuestos: ${(invoice.metadata?.taxes ?? []).map((tax) => `${tax.code ?? "N/A"} ${tax.rate ?? "-"}% ${money(tax.amount)}`).join(" / ") || "Sin adicionales"}`, 82), 7),
      bold(48, 160, "Trazabilidad XML", 9),
      text(48, 146, truncate(`Clave idempotente: ${invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}`, 82), 7),
      text(48, 132, truncate(`Origen: Gmail DTE / ${invoice.metadata?.sourceFilename ?? "XML original en Supabase"}`, 82), 7),
      text(48, 118, truncate(`Hash SHA-256: ${invoice.metadata?.xmlSha256 ?? "No informado"}`, 82), 7),
      text(48, 104, `TED: ${invoice.metadata?.hasTed ? "informado" : "no informado"} / CAF: ${invoice.metadata?.hasCaf ? "informado" : "no informado"} / Tasa IVA: ${invoice.metadata?.tasaIva ?? 19}%`, 7),
      text(48, 90, truncate(`Emisor: ${[invoice.metadata?.dirOrigen, invoice.metadata?.cmnaOrigen, invoice.metadata?.ciudadOrigen].filter(Boolean).join(" / ") || "No informado en XML"}`, 82), 7)
    );
    return ops.join("\n");
  });
}

function generatePdf(invoice: PdfInvoice) {
  const pages = pagesForInvoice(invoice);
  const pageObjectStart = 3;
  const fontObject = pageObjectStart + pages.length;
  const boldFontObject = fontObject + 1;
  const contentObjectStart = boldFontObject + 1;
  const pageRefs = pages.map((_, index) => `${pageObjectStart + index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`,
    ...pages.map((_, index) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ...pages.map((content) => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
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
    .select("*,dte_items(line_number,name,description,item_description_raw,quantity,unit,unit_price,discount_amount,surcharge_amount,additional_tax_code,line_total,item_validation_status,price_confidence_score),dte_references(referenced_folio,referenced_tipo_dte,reason),dte_taxes(tipo_imp,tasa_imp,monto_imp,dte_items(line_number)),dte_global_discounts(id)")
    .eq("folio", folio)
    .order("fecha_emision", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    documentType: invoiceType({ tipoDte: data.tipo_dte }),
    fechaEmision: data.fecha_emision,
    fechaVencimiento: data.fecha_vencimiento ?? data.fecha_emision,
    folio: data.folio,
    items: (data.dte_items ?? []).map((item: Record<string, unknown>) => ({
      additionalTaxCode: item.additional_tax_code ? String(item.additional_tax_code) : null,
      description: String(item.name ?? item.description ?? "SIN NOMBRE EN XML"),
      detailDescription: item.item_description_raw ? String(item.item_description_raw) : null,
      discountAmount: Number(item.discount_amount ?? 0),
      lineNumber: Number(item.line_number ?? 0),
      lineTotal: Number(item.line_total ?? 0),
      quantity: Number(item.quantity ?? 0),
      surchargeAmount: Number(item.surcharge_amount ?? 0),
      unit: String(item.unit ?? "UN"),
      unitPrice: Number(item.unit_price ?? 0)
    })),
    metadata: {
      ciudadOrigen: data.ciudad_origen,
      cmnaOrigen: data.cmna_origen,
      dirOrigen: data.dir_origen,
      dirReceptor: data.dir_receptor,
      giroEmisor: data.giro_emisor,
      giroReceptor: data.giro_receptor,
      globalDiscountCount: data.dte_global_discounts?.length ?? 0,
      hasCaf: Boolean(data.caf_json),
      hasTed: Boolean(data.ted_json),
      references: (data.dte_references ?? []).map((reference: Record<string, unknown>) => ({
        folio: reference.referenced_folio ? String(reference.referenced_folio) : null,
        reason: reference.reason ? String(reference.reason) : null,
        type: reference.referenced_tipo_dte ? String(reference.referenced_tipo_dte) : null
      })),
      sourceFilename: data.gmail_filename,
      tasaIva: data.tasa_iva,
      taxes: (data.dte_taxes ?? []).map((tax: Record<string, unknown>) => ({
        amount: Number(tax.monto_imp ?? 0),
        code: tax.tipo_imp ? String(tax.tipo_imp) : null,
        lineNumber: Array.isArray(tax.dte_items)
          ? Number((tax.dte_items[0] as Record<string, unknown> | undefined)?.line_number ?? 0) || null
          : null,
        rate: tax.tasa_imp === null ? null : Number(tax.tasa_imp ?? 0)
      })),
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

export async function GET(request: Request, { params }: { params: Promise<{ folio: string }> }) {
  const { folio } = await params;
  const invoice =
    (await getSupabaseInvoice(folio)) ??
    (purchasesData.invoices.find((candidate) => candidate.folio === folio) as PdfInvoice | undefined);

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "invoice_not_found" }, { status: 404 });
  }

  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";

  return new NextResponse(generatePdf(invoice), {
    headers: {
      "Content-Disposition": `${disposition}; filename="${invoice.documentType}-${invoice.folio}.pdf"`,
      "Content-Type": "application/pdf"
    }
  });
}
