import AdmZip from "adm-zip";

export type SiiRegistryRow = {
  rowNumber: number;
  tipoDte: string;
  folio: string;
  rutProveedor: string;
  razonSocial: string;
  fecha: string;
  montoTotal: number;
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
    const monto = pick(row, ["monto total", "total", "monto"]);
    return {
      fecha,
      folio,
      montoTotal: parseMoney(monto),
      razonSocial,
      rowNumber: headerRowIndex + index + 2,
      rutProveedor,
      tipoDte
    };
  }).filter((row) => row.folio && row.rutProveedor);
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

export function parseSiiRegistryFile(file: { buffer: Buffer; name: string; type?: string }) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) return toRows(parseXlsx(file.buffer));
  return toRows(parseCsv(file.buffer.toString("utf8")));
}
