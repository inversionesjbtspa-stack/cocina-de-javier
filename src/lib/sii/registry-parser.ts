import AdmZip from "adm-zip";

export type SiiRegistryRow = {
  rowNumber: number;
  periodo: string;
  tipoDte: string;
  folio: string;
  rutProveedor: string;
  razonSocial: string;
  fecha: string;
  montoNeto: number;
  iva: number;
  montoTotal: number;
};

export type SiiSummaryRow = {
  rowNumber: number;
  periodo: string;
  rutEmpresa: string;
  tipoDocumento: string;
  cantidadDocumentos: number;
  montoNeto: number;
  iva: number;
  montoTotal: number;
};

export type SiiRegistryParseResult = {
  errors: string[];
  isSummary: boolean;
  period: string;
  rows: SiiRegistryRow[];
  summaryRows: SiiSummaryRow[];
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoney(value: string) {
  const clean = value.replace(/\$/g, "").replace(/\./g, "").replace(/,/g, ".").trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRut(value: string) {
  const clean = value.replace(/\./g, "").replace(/\s+/g, "").toUpperCase();
  if (clean.includes("-")) return clean;
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function normalizeTipoDte(value: string) {
  const digits = value.match(/\d+/)?.[0] ?? value.trim();
  if (digits && /^\d+$/.test(digits)) return digits;
  const normalized = normalizeHeader(value);
  const byName: Record<string, string> = {
    "factura electronica": "33",
    "factura no afecta o exenta electronica": "34",
    "factura de compra electronica": "46",
    "guia de despacho electronica": "52",
    "nota de debito electronica": "56",
    "nota de credito electronica": "61"
  };
  for (const [name, code] of Object.entries(byName)) {
    if (normalized.includes(name)) return code;
  }
  return digits;
}

function normalizeFolio(value: string) {
  return value.replace(/\./g, "").trim();
}

function normalizeDate(value: string) {
  const clean = value.trim();
  const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return clean;
}

function detectPeriod(name: string, rows: SiiRegistryRow[]) {
  const fromName = name.match(/(20\d{2})(0[1-9]|1[0-2])/);
  if (fromName) return `${fromName[1]}-${fromName[2]}`;
  const firstDate = rows.find((row) => row.fecha)?.fecha;
  return firstDate ? firstDate.slice(0, 7) : "";
}

function detectCompanyRut(name: string) {
  const match = name.match(/REGISTRO_(\d{7,9}[0-9Kk]?|\d{7,8}-[0-9Kk])/);
  return match ? normalizeRut(match[1]) : "";
}

function pick(row: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value) return value.trim();
  }
  return "";
}

function toRows(matrix: string[][]) {
  const headerRowIndex = matrix.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes("folio")) &&
    row.some((cell) => normalizeHeader(cell).includes("rut"))
  );
  if (headerRowIndex < 0) return [];
  const headers = matrix[headerRowIndex].map(normalizeHeader);
  return matrix.slice(headerRowIndex + 1).map((cells, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ""]));
    const tipoDte = pick(row, ["tipo dte", "tipo doc", "tipo documento", "tipo"]);
    const folio = pick(row, ["folio"]);
    const rutProveedor = pick(row, ["rut proveedor", "rut emisor", "rut"]);
    const razonSocial = pick(row, ["razon social", "proveedor", "razon social proveedor", "nombre proveedor"]);
    const fecha = pick(row, ["fecha emision", "fecha documento", "fecha"]);
    const montoNeto = pick(row, ["monto neto", "neto"]);
    const iva = pick(row, ["iva", "monto iva"]);
    const monto = pick(row, ["monto total", "total", "monto"]);
    return {
      fecha: normalizeDate(fecha),
      folio: normalizeFolio(folio),
      iva: parseMoney(iva),
      montoNeto: parseMoney(montoNeto),
      montoTotal: parseMoney(monto),
      razonSocial,
      rowNumber: headerRowIndex + index + 2,
      rutProveedor: normalizeRut(rutProveedor),
      periodo: "",
      tipoDte: normalizeTipoDte(tipoDte)
    };
  }).filter((row) => row.folio && row.rutProveedor);
}

function toSummaryRows(matrix: string[][], fileName: string) {
  const headerRowIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.some((cell) => cell.includes("tipo")) &&
      normalized.some((cell) => cell.includes("documento") || cell.includes("cantidad")) &&
      normalized.some((cell) => cell.includes("monto") || cell === "total");
  });
  if (headerRowIndex < 0) return [];
  const headers = matrix[headerRowIndex].map(normalizeHeader);
  const rutEmpresa = detectCompanyRut(fileName);
  return matrix.slice(headerRowIndex + 1).map((cells, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ""]));
    const tipoDocumento = pick(row, ["tipo dte", "tipo documento", "tipo doc", "tipo"]);
    const cantidad = pick(row, ["total documentos", "cantidad documentos", "cantidad de documentos", "documentos", "cantidad", "nro documentos"]);
    const montoNeto = pick(row, ["monto neto", "neto", "monto neto activo fijo"]);
    const iva = pick(row, ["iva recuperable", "iva", "monto iva", "iva uso comun"]);
    const total = pick(row, ["monto total", "total", "monto"]);
    return {
      cantidadDocumentos: parseInteger(cantidad),
      iva: parseMoney(iva),
      montoNeto: parseMoney(montoNeto),
      montoTotal: parseMoney(total),
      periodo: "",
      rowNumber: headerRowIndex + index + 2,
      rutEmpresa,
      tipoDocumento: normalizeTipoDte(tipoDocumento)
    };
  }).filter((row) => row.tipoDocumento && (row.cantidadDocumentos > 0 || row.montoTotal > 0));
}

function parseCsv(text: string) {
  const delimiter = text.includes(";") ? ";" : text.includes("\t") ? "\t" : ",";
  return text
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()))
    .filter((row) => row.some(Boolean));
}

function xmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function parseXlsx(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const sharedXml = zip.getEntry("xl/sharedStrings.xml")?.getData().toString("utf8") ?? "";
  const sharedStrings = [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlText(match[1]));
  const sheetName = zip.getEntries().find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName))?.entryName;
  if (!sheetName) return [];
  const sheetXml = zip.getEntry(sheetName)?.getData().toString("utf8") ?? "";
  const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<c[^>]*(?:r="([A-Z]+)\d+")?[^>]*(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)];
    const output: string[] = [];
    for (const cell of cells) {
      const column = cell[1] ? cell[1].split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1 : output.length;
      const rawValue = cell[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cell[3].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      output[column] = cell[2] === "s" ? sharedStrings[Number(rawValue)] ?? "" : xmlText(rawValue);
    }
    return output;
  });
  return rows;
}

export function parseSiiRegistryFile(file: { buffer: Buffer; name: string; type?: string }): SiiRegistryParseResult {
  const lower = file.name.toLowerCase();
  const matrix = lower.endsWith(".xlsx") ? parseXlsx(file.buffer) : parseCsv(file.buffer.toString("utf8"));
  const rows = toRows(matrix);
  const period = detectPeriod(file.name, rows);
  const withPeriod = rows.map((row) => ({ ...row, periodo: period || row.fecha.slice(0, 7) }));
  const summaryRows = toSummaryRows(matrix, file.name);
  const summaryPeriod = period || detectPeriod(file.name, []);
  const summaryWithPeriod = summaryRows.map((row) => ({ ...row, periodo: summaryPeriod }));
  const flattened = matrix.flat().map(normalizeHeader).join(" ");
  const isSummary = !rows.length && (flattened.includes("resumen") || summaryRows.length > 0);
  return {
    errors: isSummary && !summaryRows.length ? ["El archivo parece ser resumen RCV, pero no se pudieron detectar filas agregadas por tipo de documento."] : [],
    isSummary,
    period: period || summaryPeriod,
    rows: withPeriod,
    summaryRows: summaryWithPeriod
  };
}
