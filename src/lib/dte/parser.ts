import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  ExtractedDteGlobalDiscount,
  ExtractedDteInvoice,
  ExtractedDteItem,
  ExtractedDteReference,
  ExtractedDteTax
} from "@/lib/dte/types";

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: true,
  preserveOrder: false,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value).trim() || null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeItemName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function validateLine({
  discountAmount,
  lineTotal,
  quantity,
  surchargeAmount,
  unitPrice
}: {
  discountAmount: number;
  lineTotal: number;
  quantity: number;
  surchargeAmount: number;
  unitPrice: number;
}) {
  const errors: string[] = [];
  if (quantity <= 0) {
    errors.push("QtyItem ausente o menor/igual a cero.");
  }
  if (unitPrice <= 0) {
    errors.push("PrcItem ausente o menor/igual a cero.");
  }
  if (lineTotal < 0) {
    errors.push("MontoItem negativo.");
  }

  const expected = quantity * unitPrice - discountAmount + surchargeAmount;
  const tolerance = Math.max(10, Math.abs(lineTotal) * 0.03);
  const diff = Math.abs(expected - lineTotal);
  if (quantity > 0 && unitPrice > 0 && diff > tolerance) {
    errors.push(
      `QtyItem * PrcItem ajustado no calza con MontoItem. Esperado ${expected.toFixed(2)}, XML ${lineTotal.toFixed(2)}.`
    );
  }

  const status: "valid" | "warning" = errors.length ? "warning" : "valid";
  const confidence = errors.length ? Math.max(0, 100 - errors.length * 35 - Math.min(30, diff / 1000)) : 100;
  return {
    confidence: Number(confidence.toFixed(2)),
    errors,
    status
  };
}

function firstDte(parsed: Record<string, unknown>) {
  const envio = (parsed.EnvioDTE ?? parsed) as Record<string, unknown>;
  const setDte = (envio.SetDTE ?? {}) as Record<string, unknown>;
  const candidates = asArray(
    (setDte.DTE ?? envio.DTE ?? parsed.DTE) as Record<string, unknown> | Record<string, unknown>[] | undefined
  );
  return {
    dte: candidates[0] ?? parsed,
    envio,
    setDte
  };
}

function itemCode(line: Record<string, unknown>) {
  const codes = asArray(line.CdgItem as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const first = codes[0] ?? {};
  return {
    itemCode: text(first.VlrCodigo),
    codeType: text(first.TpoCodigo),
    codeValue: text(first.VlrCodigo)
  };
}

export function parseDteXml({
  xml,
  sourceMessageId,
  sourceThreadId = null,
  sourceAttachmentId,
  sourceFilename,
  sourceReceivedAt = null,
  sourceSender = null,
  sourceSubject = null
}: {
  xml: string;
  sourceMessageId: string;
  sourceThreadId?: string | null;
  sourceAttachmentId: string;
  sourceFilename: string;
  sourceReceivedAt?: string | null;
  sourceSender?: string | null;
  sourceSubject?: string | null;
}): ExtractedDteInvoice {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const { dte, setDte } = firstDte(parsed);
  const documento = ((dte as Record<string, unknown>)?.Documento ?? dte) as Record<string, unknown>;
  const encabezado = (documento?.Encabezado ?? {}) as Record<string, unknown>;
  const idDoc = (encabezado?.IdDoc ?? {}) as Record<string, unknown>;
  const emisor = (encabezado?.Emisor ?? {}) as Record<string, unknown>;
  const receptor = (encabezado?.Receptor ?? {}) as Record<string, unknown>;
  const totales = (encabezado?.Totales ?? {}) as Record<string, unknown>;

  const tipoDte = text(idDoc.TipoDTE);
  const folio = text(idDoc.Folio);
  const rutEmisor = text(emisor.RUTEmisor);
  const rutReceptor = text(receptor.RUTRecep);
  const fechaEmision = text(idDoc.FchEmis);

  if (!tipoDte || !folio || !rutEmisor || !rutReceptor || !fechaEmision) {
    throw new Error(`Invalid DTE XML header in ${sourceFilename}`);
  }

  const items: ExtractedDteItem[] = asArray(
    documento?.Detalle as Record<string, unknown> | Record<string, unknown>[] | undefined
  ).map((line, index) => {
    const code = itemCode(line);
    const parserErrors: string[] = [];
    const name = text(line.NmbItem) ?? text(line.DscItem) ?? "SIN DESCRIPCION XML";
    if (!text(line.NmbItem) && !text(line.DscItem)) {
      parserErrors.push("Detalle sin NmbItem ni DscItem.");
    }
    const discountAmount = numberValue(line.DescuentoMonto);
    const surchargeAmount = numberValue(line.RecargoMonto);
    const quantity = numberValue(line.QtyItem) || 1;
    const unitPrice = numberValue(line.PrcItem);
    const lineTotal = numberValue(line.MontoItem);
    const validation = validateLine({
      discountAmount,
      lineTotal,
      quantity,
      surchargeAmount,
      unitPrice
    });
    return {
      ...code,
      additionalTaxCode: text(line.CodImpAdic),
      description: text(line.DscItem) ?? name,
      discountAmount,
      discountPct: optionalNumber(line.DescuentoPct),
      lineNumber: numberValue(line.NroLinDet) || index + 1,
      lineTotal,
      name,
      normalizedName: normalizeItemName(name),
      priceConfidenceScore: validation.confidence,
      quantity,
      raw: line,
      surchargeAmount,
      surchargePct: optionalNumber(line.RecargoPct),
      unit: text(line.UnmdItem) ?? "unidad",
      unitPrice,
      validationErrors: [...parserErrors, ...validation.errors],
      validationStatus: parserErrors.length ? "error" : validation.status
    };
  });

  const references: ExtractedDteReference[] = asArray(
    documento?.Referencia as Record<string, unknown> | Record<string, unknown>[] | undefined
  ).map((reference) => ({
    lineNumber: optionalNumber(reference.NroLinRef),
    raw: reference,
    reason: text(reference.RazonRef),
    referenceCode: text(reference.CodRef),
    referenceDate: text(reference.FchRef),
    referencedFolio: text(reference.FolioRef),
    referencedTipoDte: text(reference.TpoDocRef)
  }));

  const globalDiscounts: ExtractedDteGlobalDiscount[] = asArray(
    documento?.DscRcgGlobal as Record<string, unknown> | Record<string, unknown>[] | undefined
  ).map((discount) => ({
    description: text(discount.GlosaDR),
    exemptIndicator: text(discount.IndExeDR),
    lineNumber: optionalNumber(discount.NroLinDR),
    movementType: text(discount.TpoMov),
    otherCurrencyValue: optionalNumber(discount.ValorDROtrMnda),
    raw: discount,
    value: optionalNumber(discount.ValorDR),
    valueType: text(discount.TpoValor)
  }));

  const itemTaxes: ExtractedDteTax[] = items
    .filter((item) => item.additionalTaxCode)
    .map((item) => ({
      lineNumber: item.lineNumber,
      montoImp: 0,
      raw: item.raw,
      tasaImp: null,
      tipoImp: item.additionalTaxCode
    }));

  const totalTaxes: ExtractedDteTax[] = asArray(
    totales.ImptoReten as Record<string, unknown> | Record<string, unknown>[] | undefined
  ).map((tax) => ({
    lineNumber: null,
    montoImp: numberValue(tax.MontoImp),
    raw: tax,
    tasaImp: optionalNumber(tax.TasaImp),
    tipoImp: text(tax.TipoImp)
  }));

  const ted = (documento.TED ?? null) as Record<string, unknown> | null;
  const xmlSha256 = sha256(xml);
  const caratula = (setDte.Caratula ?? {}) as Record<string, unknown>;

  return {
    acteco: text(emisor.Acteco),
    cdgSiiSucur: text(emisor.CdgSIISucur),
    ciudadOrigen: text(emisor.CiudadOrigen),
    ciudadReceptor: text(receptor.CiudadRecep),
    cmnaOrigen: text(emisor.CmnaOrigen),
    cmnaReceptor: text(receptor.CmnaRecep),
    dirOrigen: text(emisor.DirOrigen),
    dirReceptor: text(receptor.DirRecep),
    fechaEmision,
    fechaVencimiento: text(idDoc.FchVenc),
    folio,
    formaPago: text(idDoc.FmaPago),
    giroEmisor: text(emisor.GiroEmis),
    giroReceptor: text(receptor.GiroRecep),
    idempotencyKey: `${rutEmisor}:${tipoDte}:${folio}:${xmlSha256}`,
    items,
    iva: numberValue(totales.IVA),
    ivaUsoComun: optionalNumber(totales.IVAUsoComun),
    montoBruto: optionalNumber(idDoc.MntBruto),
    montoExento: numberValue(totales.MntExe),
    montoNeto: numberValue(totales.MntNeto),
    montoPeriodo: optionalNumber(totales.MontoPeriodo),
    montoTotal: numberValue(totales.MntTotal),
    raw: {
      caf: ted && typeof ted === "object" ? (ted.DD as Record<string, unknown> | undefined)?.CAF ?? null : null,
      emitter: emisor,
      frmt: ted && typeof ted === "object" ? text(ted.FRMT) : null,
      globalDiscounts,
      parsedJson: parsed,
      parserErrors: items.flatMap((item) => item.validationStatus === "error" ? item.validationErrors : []),
      parserWarnings: items.flatMap((item) => item.validationStatus === "warning" ? item.validationErrors : []),
      receiver: receptor,
      references,
      taxes: [...totalTaxes, ...itemTaxes],
      ted,
      trackId: text(caratula.TmstFirmaEnv)
    },
    razonSocialEmisor: text(emisor.RznSoc),
    razonSocialReceptor: text(receptor.RznSocRecep),
    rutEmisor,
    rutReceptor,
    sourceAttachmentId,
    sourceFilename,
    sourceMessageId,
    sourceReceivedAt,
    sourceSender,
    sourceSubject,
    sourceThreadId,
    tasaIva: optionalNumber(totales.TasaIVA),
    termPagoGlosa: text(idDoc.TermPagoGlosa),
    tipoDte,
    tipoTranCompra: text(idDoc.TpoTranCompra),
    tipoTranVenta: text(idDoc.TpoTranVenta),
    valorPagar: optionalNumber(totales.VlrPagar),
    xmlSha256
  };
}
