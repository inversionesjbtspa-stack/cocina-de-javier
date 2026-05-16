import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedDteInvoice, ExtractedDteItem } from "@/lib/dte/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
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

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseDteXml({
  xml,
  sourceMessageId,
  sourceAttachmentId,
  sourceFilename
}: {
  xml: string;
  sourceMessageId: string;
  sourceAttachmentId: string;
  sourceFilename: string;
}): ExtractedDteInvoice {
  const parsed = parser.parse(xml);
  const envio = parsed.EnvioDTE ?? parsed.DTE ?? parsed;
  const dte = asArray(envio.SetDTE?.DTE ?? envio.DTE ?? parsed.DTE)[0];
  const documento = dte?.Documento ?? dte;
  const encabezado = documento?.Encabezado;
  const idDoc = encabezado?.IdDoc;
  const emisor = encabezado?.Emisor;
  const receptor = encabezado?.Receptor;
  const totales = encabezado?.Totales;

  const tipoDte = text(idDoc?.TipoDTE);
  const folio = text(idDoc?.Folio);
  const rutEmisor = text(emisor?.RUTEmisor);
  const rutReceptor = text(receptor?.RUTRecep);
  const fechaEmision = text(idDoc?.FchEmis);

  if (!tipoDte || !folio || !rutEmisor || !rutReceptor || !fechaEmision) {
    throw new Error(`Invalid DTE XML header in ${sourceFilename}`);
  }

  const items: ExtractedDteItem[] = asArray(documento?.Detalle).map(
    (line: Record<string, unknown>, index) => ({
      lineNumber: numberValue(line.NroLinDet) || index + 1,
      description: text(line.NmbItem) ?? "Item sin descripcion",
      quantity: numberValue(line.QtyItem) || 1,
      unit: text(line.UnmdItem) ?? "unidad",
      unitPrice: numberValue(line.PrcItem),
      lineTotal: numberValue(line.MontoItem)
    })
  );

  const xmlSha256 = sha256(xml);

  return {
    idempotencyKey: `${rutEmisor}:${tipoDte}:${folio}:${xmlSha256}`,
    tipoDte,
    folio,
    rutEmisor,
    razonSocialEmisor: text(emisor?.RznSoc),
    rutReceptor,
    razonSocialReceptor: text(receptor?.RznSocRecep),
    fechaEmision,
    montoNeto: numberValue(totales?.MntNeto),
    montoExento: numberValue(totales?.MntExe),
    iva: numberValue(totales?.IVA),
    montoTotal: numberValue(totales?.MntTotal),
    xmlSha256,
    sourceMessageId,
    sourceAttachmentId,
    sourceFilename,
    items
  };
}
