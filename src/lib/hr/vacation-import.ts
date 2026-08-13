import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { normalizeRut } from "./utils.ts";

export type VacationImportKind = "balances" | "used_vacations" | "movements";
export type VacationImportStatus = "LISTO" | "DUPLICADO" | "TRABAJADOR NO ENCONTRADO" | "PERIODO NO RESUELTO" | "DATOS INVALIDOS" | "REVISAR";

export type VacationImportEmployee = {
  fullName: string;
  id: string;
  rut: string;
};

export type VacationImportExistingRow = {
  row_hash: string | null;
};

export type VacationImportPreviewRow = {
  days: number;
  employeeId: string | null;
  employeeName: string;
  effectiveDate: string | null;
  importType: VacationImportKind;
  notes: string | null;
  periodEnd: string | null;
  periodId: string | null;
  periodStart: string | null;
  raw: Record<string, string>;
  rowHash: string;
  rowNumber: number;
  rut: string;
  status: VacationImportStatus;
};

export type VacationImportPreview = {
  rows: VacationImportPreviewRow[];
  sourceHash: string;
  summary: {
    duplicates: number;
    invalid: number;
    notFound: number;
    ready: number;
    review: number;
    total: number;
  };
};

type ParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

const HEADER_ALIASES = {
  rut: ["rut", "run", "rut trabajador", "run trabajador", "rut empleado", "rut colaborador"],
  balance: ["saldo", "saldo vacaciones", "dias disponibles", "dias vacaciones", "saldo disponible"],
  cutoffDate: ["fecha corte", "corte", "saldo al", "fecha saldo"],
  startDate: ["desde", "fecha inicio", "inicio", "start"],
  endDate: ["hasta", "fecha termino", "termino", "fin", "end"],
  date: ["fecha", "fecha movimiento", "fecha ajuste"],
  type: ["tipo", "tipo movimiento", "movimiento"],
  days: ["dias", "dias usados", "dias habiles", "dias movimiento"],
  notes: ["observacion", "observaciones", "nota", "motivo", "comentario"]
} as const;

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function findHeader(headers: string[], aliases: readonly string[]) {
  const normalized = headers.map(normalizeHeader);
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const index = normalized.findIndex((header) => aliasSet.has(header));
  return index >= 0 ? headers[index] : null;
}

export function sha256(buffer: Buffer | string) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseDate(value: string | undefined) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return clean;
  const slash = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  return null;
}

function parseNumber(value: string | undefined) {
  const clean = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function csvSplit(line: string) {
  const separator = line.includes(";") ? ";" : ",";
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(buffer: Buffer): ParsedRow[] {
  const lines = buffer.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = csvSplit(lines[0]);
  return lines.slice(1).map((line, index) => {
    const values = csvSplit(line);
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]))
    };
  });
}

function textFromCell(cell: string, sharedStrings: string[]) {
  const type = cell.match(/\st="([^"]+)"/)?.[1];
  const value = cell.match(/<v>(.*?)<\/v>/)?.[1] ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "inlineStr") return cell.match(/<t[^>]*>(.*?)<\/t>/)?.[1] ?? "";
  return value;
}

function parseSharedStrings(zip: AdmZip) {
  const xml = zip.getEntry("xl/sharedStrings.xml")?.getData().toString("utf8") ?? "";
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) =>
    Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((text) => text[1]).join("")
  );
}

function parseXlsx(buffer: Buffer): ParsedRow[] {
  const zip = new AdmZip(buffer);
  const sharedStrings = parseSharedStrings(zip);
  const sheetName = zip.getEntries().find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName))?.entryName;
  if (!sheetName) return [];
  const xml = zip.getEntry(sheetName)?.getData().toString("utf8") ?? "";
  const rows = Array.from(xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g));
  const parsed = rows.map((row) => ({
    number: Number(row[1]),
    cells: Array.from(row[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)).map((cell) => ({
      column: cell[1],
      value: textFromCell(cell[0], sharedStrings)
    }))
  }));
  const headerRow = parsed.find((row) => row.cells.some((cell) => cell.value.trim()));
  if (!headerRow) return [];
  const headers = headerRow.cells.map((cell) => cell.value.trim());
  return parsed
    .filter((row) => row.number > headerRow.number)
    .map((row) => {
      const byColumn = new Map(row.cells.map((cell) => [cell.column, cell.value]));
      return {
        rowNumber: row.number,
        values: Object.fromEntries(headerRow.cells.map((header, index) => [headers[index] || header.column, byColumn.get(header.column) ?? ""]))
      };
    })
    .filter((row) => Object.values(row.values).some((value) => String(value).trim()));
}

export function parseVacationImportFile(buffer: Buffer, filename: string): ParsedRow[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buffer);
  if (lower.endsWith(".xlsx")) return parseXlsx(buffer);
  return [];
}

function getMappedValue(row: Record<string, string>, key: keyof typeof HEADER_ALIASES, mapping: Record<string, string> = {}) {
  const headers = Object.keys(row);
  const mappedHeader = mapping[key];
  if (mappedHeader && mappedHeader in row) return row[mappedHeader];
  const header = findHeader(headers, HEADER_ALIASES[key]);
  return header ? row[header] : "";
}

function movementTypeFor(importType: VacationImportKind, rawType: string) {
  if (importType === "balances") return "imported_history";
  if (importType === "used_vacations") return "used";
  const normalized = normalizeHeader(rawType);
  if (normalized.includes("inicial") || normalized.includes("saldo")) return "initial_balance";
  if (normalized.includes("progres")) return "progressive";
  if (normalized.includes("ajuste")) return "adjustment";
  if (normalized.includes("usad") || normalized.includes("tomad")) return "used";
  return "imported_history";
}

export function previewVacationImport(input: {
  employees: VacationImportEmployee[];
  existingRowHashes?: VacationImportExistingRow[];
  importType: VacationImportKind;
  mapping?: Record<string, string>;
  parsedRows: ParsedRow[];
  periodResolver: (employeeId: string, date: string) => { id: string; periodEnd: string; periodStart: string } | null;
  sourceHash: string;
}): VacationImportPreview {
  const employeesByRut = new Map(input.employees.map((employee) => [normalizeRut(employee.rut), employee]));
  const duplicateRuts = new Set<string>();
  const seenRuts = new Set<string>();
  for (const employee of input.employees) {
    const rut = normalizeRut(employee.rut);
    if (seenRuts.has(rut)) duplicateRuts.add(rut);
    seenRuts.add(rut);
  }
  const existing = new Set((input.existingRowHashes ?? []).map((row) => row.row_hash).filter(Boolean) as string[]);
  const rows = input.parsedRows.map((row) => {
    const rut = normalizeRut(getMappedValue(row.values, "rut", input.mapping));
    const employee = rut ? employeesByRut.get(rut) ?? null : null;
    const balance = parseNumber(getMappedValue(row.values, "balance", input.mapping));
    const days = parseNumber(getMappedValue(row.values, "days", input.mapping));
    const cutoffDate = parseDate(getMappedValue(row.values, "cutoffDate", input.mapping));
    const startDate = parseDate(getMappedValue(row.values, "startDate", input.mapping));
    const date = parseDate(getMappedValue(row.values, "date", input.mapping));
    const notes = getMappedValue(row.values, "notes", input.mapping).trim() || null;
    const effectiveDate = input.importType === "balances" ? cutoffDate : input.importType === "used_vacations" ? startDate : date;
    const movementDays = input.importType === "balances" ? balance : input.importType === "used_vacations" ? days ?? balance : days;
    const rowHash = sha256(JSON.stringify({ importType: input.importType, movementDays, raw: row.values, rut, effectiveDate }));
    const period = employee && effectiveDate ? input.periodResolver(employee.id, effectiveDate) : null;
    let status: VacationImportStatus = "LISTO";
    if (!rut || !effectiveDate || movementDays === null) status = "DATOS INVALIDOS";
    else if (duplicateRuts.has(rut)) status = "REVISAR";
    else if (!employee) status = "TRABAJADOR NO ENCONTRADO";
    else if (existing.has(rowHash)) status = "DUPLICADO";
    else if (!period) status = "PERIODO NO RESUELTO";
    const statusNote = status === "REVISAR"
      ? "RUT duplicado entre trabajadores activos"
      : status === "DUPLICADO"
        ? "Fila ya importada"
        : status === "TRABAJADOR NO ENCONTRADO"
          ? "Trabajador no encontrado por RUT"
          : status === "DATOS INVALIDOS"
            ? "Fila incompleta o monto invalido"
            : status === "PERIODO NO RESUELTO"
              ? "Sin periodo contractual para la fecha"
              : null;
    return {
      days: movementDays ?? 0,
      employeeId: employee?.id ?? null,
      employeeName: employee?.fullName ?? "",
      effectiveDate,
      importType: input.importType,
      notes: notes ?? statusNote,
      periodEnd: period?.periodEnd ?? null,
      periodId: period?.id ?? null,
      periodStart: period?.periodStart ?? null,
      raw: row.values,
      rowHash,
      rowNumber: row.rowNumber,
      rut,
      status
    };
  });
  return {
    rows,
    sourceHash: input.sourceHash,
    summary: {
      duplicates: rows.filter((row) => row.status === "DUPLICADO").length,
      invalid: rows.filter((row) => row.status === "DATOS INVALIDOS").length,
      notFound: rows.filter((row) => row.status === "TRABAJADOR NO ENCONTRADO").length,
      ready: rows.filter((row) => row.status === "LISTO").length,
      review: rows.filter((row) => ["REVISAR", "PERIODO NO RESUELTO"].includes(row.status)).length,
      total: rows.length
    }
  };
}

export { movementTypeFor };
