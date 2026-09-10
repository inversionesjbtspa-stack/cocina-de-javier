import AdmZip from "adm-zip";
import { mapBankName } from "../payments/bank-mappings.ts";
import { normalizeRut } from "./utils.ts";
import { parseHrBankWorkbook } from "./bank-import-parser.ts";

export const HR_TEF_ORIGIN_ACCOUNT = "71068862";
export const HR_TEF_CURRENCY = "CLP";
export const HR_TEF_HEADERS = [
  "Cta_origen",
  "moneda_origen",
  "Cta_destino",
  "moneda_destino",
  "Cod_banco",
  "RUT benef.",
  "nombre benef.",
  "Mto Total",
  "Glosa TEF",
  "Correo",
  "Glosa correo"
] as const;

export type HrBankSourceRow = {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  email: string;
  glosaTef: string;
  holderName: string;
  holderRut: string;
  realOwnerName: string;
  rowNumber: number;
  source: Record<string, string | number>;
};

export type HrBankImportEmployee = {
  bankAccount?: {
    accountNumber?: string | null;
    bankCode?: string | null;
    glosaTef?: string | null;
    holderName?: string | null;
    holderRut?: string | null;
    paymentEmail?: string | null;
    realOwnerName?: string | null;
  } | null;
  fullName: string;
  id: string;
  rut: string;
  status?: string | null;
};

export type HrBankPreviewRow = HrBankSourceRow & {
  employeeId: string | null;
  employeeName: string | null;
  isThirdParty: boolean;
  matchedBy: "rut" | null;
  missing: string[];
  status: "LISTO" | "TRABAJADOR NO ENCONTRADO" | "RUT DUPLICADO" | "CUENTA DUPLICADA" | "DATOS INCOMPLETOS" | "CAMBIO DE CUENTA" | "YA EXISTE SIN CAMBIOS" | "CUENTA DE TERCERO / REVISAR";
};

export type HrBankPreviewSummary = {
  accountChanges: number;
  duplicateAccounts: number;
  duplicateRuts: number;
  noChanges: number;
  ready: number;
  thirdPartyReview: number;
  total: number;
  unmatched: number;
  incomplete: number;
};

export type HrPaymentForTef = {
  accountNumber?: string | null;
  accountType?: string | null;
  amount: number;
  bankCode?: string | null;
  bankName?: string | null;
  employeeId: string;
  employeeName: string;
  employeeRut?: string | null;
  glosa?: string | null;
  holderName?: string | null;
  holderRut?: string | null;
  id: string;
  paymentEmail?: string | null;
  paymentType: string;
  period: string;
  realOwnerName?: string | null;
  status: string;
};

export type HrTefPreviewRow = {
  accountNumber: string;
  amount: number;
  bankCode: string;
  employeeId: string;
  employeeName: string;
  glosaCorreo: string;
  glosaTef: string;
  holderRut: string;
  itemId: string;
  paymentEmail: string;
  realOwnerName: string;
  status: "LISTO" | "BANCO INCOMPLETO" | "SIN PAGO / $0" | "CUENTA DE TERCERO / REVISAR" | "DUPLICADO";
  warnings: string[];
};

export type HrTefPreviewSummary = {
  duplicate: number;
  included: number;
  incompleteBank: number;
  ready: number;
  thirdPartyReview: number;
  total: number;
  totalAmount: number;
  zeroAmount: number;
};

const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizePersonName(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function rutKey(value: string) {
  return normalizeRut(value).replace(/-/g, "");
}

function textCell(ref: string, value: string) {
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number) {
  return `<c r="${ref}"><v>${Math.round(value)}</v></c>`;
}

function xlsxRows(values: Array<Array<string | number>>) {
  return values.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const column = String.fromCharCode(65 + columnIndex);
      return typeof value === "number" ? numberCell(`${column}${rowNumber}`, value) : textCell(`${column}${rowNumber}`, value);
    }).join("");
    return `<row r="${rowNumber}" spans="1:${HR_TEF_HEADERS.length}">${cells}</row>`;
  }).join("");
}

function xmlText(node: string) {
  return node.replace(/<[^>]+>/g, "");
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]) {
  const rows: Array<{ cells: Map<number, string>; rowNumber: number }> = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<number, string>();
    for (const cellMatch of rowMatch[2].matchAll(/<c([^>]*)r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = `${cellMatch[1]} ${cellMatch[3]}`;
      const columnRef = cellMatch[2];
      const column = columnRef.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const body = cellMatch[4];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? xmlText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      cells.set(column, type === "s" ? sharedStrings[Number(raw)] ?? "" : cleanText(raw));
    }
    rows.push({ cells, rowNumber: Number(rowMatch[1]) });
  }
  return rows;
}

function parseXlsxBankRows(buffer: Buffer): { rows: HrBankSourceRow[]; sheetName: string } {
  const zip = new AdmZip(buffer);
  const workbookXml = zip.getEntry("xl/workbook.xml")?.getData().toString("utf8") ?? "";
  const relsXml = zip.getEntry("xl/_rels/workbook.xml.rels")?.getData().toString("utf8") ?? "";
  const sharedXml = zip.getEntry("xl/sharedStrings.xml")?.getData().toString("utf8") ?? "";
  const sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]));
  const rels = new Map([...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  const candidates: Array<{ hasRealOwnerHeader: boolean; rows: HrBankSourceRow[]; sheetName: string }> = [];
  for (const sheetMatch of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.get(sheetMatch[2]);
    if (!target) continue;
    const entryName = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
    const sheetXml = zip.getEntry(entryName)?.getData().toString("utf8");
    if (!sheetXml) continue;
    const rows = parseSheetRows(sheetXml, sharedStrings);
    const headerRow = rows.find((row) => {
      const headers = [...row.cells.values()].map(normalizeHeader).join("|");
      return headers.includes("cta_destino") && headers.includes("cod_banco") && headers.includes("rut_benef") && headers.includes("correo");
    });
    if (!headerRow) continue;
    const headers = new Map<number, string>();
    for (const [column, value] of headerRow.cells.entries()) headers.set(column, normalizeHeader(value));
    const headerValues = [...headers.values()];
    const hasRealOwnerHeader = headerValues.includes("propietario_real_de_la_cuenta");
    const get = (source: Record<string, string | number>, key: string) => cleanText(source[key]);
    candidates.push({
      hasRealOwnerHeader,
      sheetName: sheetMatch[1],
      rows: rows.filter((row) => row.rowNumber > headerRow.rowNumber).map((row) => {
        const source: Record<string, string | number> = {};
        for (const [column, value] of row.cells.entries()) {
          const header = headers.get(column);
          if (header) source[header] = value;
        }
        const bankCode = get(source, "cod_banco");
        const bankMapping = mapBankName(bankCode);
        const glosaTef = get(source, "nombre_seg_n_glosa_tef") || get(source, "nombre_segun_glosa_tef") || get(source, "nombre_benef") || get(source, "glosa_tef");
        return {
          accountNumber: get(source, "cta_destino"),
          bankCode,
          bankName: bankMapping.needsReview ? bankCode : bankMapping.bankNameNormalized,
          email: get(source, "correo"),
          glosaTef,
          holderName: glosaTef,
          holderRut: normalizeRut(get(source, "rut_benef")),
          realOwnerName: get(source, "propietario_real_de_la_cuenta"),
          rowNumber: row.rowNumber,
          source
        };
      }).filter((row) => row.accountNumber || row.holderRut || row.glosaTef || row.realOwnerName)
    });
  }
  const selected = candidates.sort((left, right) =>
    Number(right.hasRealOwnerHeader) - Number(left.hasRealOwnerHeader) ||
    Number(right.sheetName.toLowerCase() === "hoja2") - Number(left.sheetName.toLowerCase() === "hoja2")
  )[0];
  if (selected) return { rows: selected.rows, sheetName: selected.sheetName };
  throw new Error("hr_bank_headers_not_found");
}

export function parseHrBankSourceFile(buffer: Buffer, filename: string): { rows: HrBankSourceRow[]; sheetName: string; sourceKind: "xlsx" | "xls" } {
  if (/\.xlsx$/i.test(filename)) return { ...parseXlsxBankRows(buffer), sourceKind: "xlsx" };
  const legacyRows = parseHrBankWorkbook(buffer).map((row) => ({
    accountNumber: row.accountNumber,
    bankCode: row.bankCode,
    bankName: row.bankName,
    email: row.email,
    glosaTef: row.glosaTef,
    holderName: row.holderName,
    holderRut: row.holderRut,
    realOwnerName: row.holderName,
    rowNumber: row.rowNumber,
    source: row.source
  }));
  return { rows: legacyRows, sheetName: "Workbook", sourceKind: "xls" };
}

export function buildBankImportPreview(rows: HrBankSourceRow[], employees: HrBankImportEmployee[]) {
  const employeesByRut = new Map(employees.map((employee) => [rutKey(employee.rut), employee]));
  const rowRutCount = new Map<string, number>();
  const rowAccountCount = new Map<string, number>();
  for (const row of rows) {
    if (row.holderRut) rowRutCount.set(row.holderRut, (rowRutCount.get(row.holderRut) ?? 0) + 1);
    if (row.accountNumber) rowAccountCount.set(row.accountNumber, (rowAccountCount.get(row.accountNumber) ?? 0) + 1);
  }
  const previewRows: HrBankPreviewRow[] = rows.map((row) => {
    const missing = [];
    if (!row.holderRut) missing.push("RUT beneficiario");
    if (!row.accountNumber) missing.push("cuenta destino");
    if (!row.bankCode) missing.push("codigo banco");
    if (!row.email) missing.push("correo");
    const employee = employeesByRut.get(rutKey(row.holderRut));
    const isThirdParty = Boolean(employee && row.realOwnerName && normalizePersonName(row.realOwnerName) !== normalizePersonName(employee.fullName));
    const accountUsedByOther = row.accountNumber && employees.some((candidate) => candidate.id !== employee?.id && candidate.bankAccount?.accountNumber === row.accountNumber);
    let status: HrBankPreviewRow["status"] = "LISTO";
    if (row.holderRut && (rowRutCount.get(row.holderRut) ?? 0) > 1) status = "RUT DUPLICADO";
    else if (row.accountNumber && ((rowAccountCount.get(row.accountNumber) ?? 0) > 1 || accountUsedByOther)) status = "CUENTA DUPLICADA";
    else if (missing.length) status = "DATOS INCOMPLETOS";
    else if (!employee) status = "TRABAJADOR NO ENCONTRADO";
    else if (isThirdParty) status = "CUENTA DE TERCERO / REVISAR";
    else if (employee.bankAccount?.accountNumber && employee.bankAccount.accountNumber !== row.accountNumber) status = "CAMBIO DE CUENTA";
    else if (employee.bankAccount?.accountNumber === row.accountNumber && employee.bankAccount?.bankCode === row.bankCode && employee.bankAccount?.paymentEmail === row.email) status = "YA EXISTE SIN CAMBIOS";
    return {
      ...row,
      employeeId: employee?.id ?? null,
      employeeName: employee?.fullName ?? null,
      isThirdParty,
      matchedBy: employee ? "rut" : null,
      missing,
      status
    };
  });
  const summary: HrBankPreviewSummary = {
    accountChanges: previewRows.filter((row) => row.status === "CAMBIO DE CUENTA").length,
    duplicateAccounts: previewRows.filter((row) => row.status === "CUENTA DUPLICADA").length,
    duplicateRuts: previewRows.filter((row) => row.status === "RUT DUPLICADO").length,
    noChanges: previewRows.filter((row) => row.status === "YA EXISTE SIN CAMBIOS").length,
    ready: previewRows.filter((row) => row.status === "LISTO" || row.status === "CAMBIO DE CUENTA").length,
    thirdPartyReview: previewRows.filter((row) => row.status === "CUENTA DE TERCERO / REVISAR").length,
    total: previewRows.length,
    unmatched: previewRows.filter((row) => row.status === "TRABAJADOR NO ENCONTRADO").length,
    incomplete: previewRows.filter((row) => row.status === "DATOS INCOMPLETOS").length
  };
  return { rows: previewRows, summary };
}

function glosaFor(payment: HrPaymentForTef) {
  const [year, month] = payment.period.split("-");
  const monthName = monthNames[Number(month) - 1] ?? month;
  return (payment.glosa || `PAGO REMUNERACION ${monthName} ${year}`).toUpperCase();
}

export function buildHrTefPreview(payments: HrPaymentForTef[], existingPaymentItemIds: string[] = []) {
  const activeIds = new Set(existingPaymentItemIds);
  const rows: HrTefPreviewRow[] = payments.map((payment) => {
    const warnings = [];
    if (!payment.bankName) warnings.push("banco");
    if (!payment.bankCode) warnings.push("codigo banco");
    if (!payment.accountType) warnings.push("tipo cuenta");
    if (!payment.accountNumber) warnings.push("cuenta destino");
    if (!payment.holderRut && !payment.employeeRut) warnings.push("RUT beneficiario");
    if (!payment.paymentEmail) warnings.push("correo");
    const owner = payment.realOwnerName || payment.holderName || payment.employeeName;
    const thirdParty = owner && normalizePersonName(owner) !== normalizePersonName(payment.employeeName);
    let status: HrTefPreviewRow["status"] = "LISTO";
    if (Number(payment.amount) <= 0) status = "SIN PAGO / $0";
    else if (activeIds.has(payment.id)) status = "DUPLICADO";
    else if (warnings.length) status = "BANCO INCOMPLETO";
    else if (thirdParty) status = "CUENTA DE TERCERO / REVISAR";
    return {
      accountNumber: payment.accountNumber ?? "",
      amount: Number(payment.amount ?? 0),
      bankCode: payment.bankCode ?? "",
      employeeId: payment.employeeId,
      employeeName: payment.employeeName,
      glosaCorreo: glosaFor(payment),
      glosaTef: glosaFor(payment),
      holderRut: normalizeRut(payment.holderRut || payment.employeeRut || ""),
      itemId: payment.id,
      paymentEmail: payment.paymentEmail ?? "",
      realOwnerName: owner,
      status,
      warnings
    };
  });
  const included = rows.filter((row) => row.status === "LISTO" || row.status === "CUENTA DE TERCERO / REVISAR");
  const summary: HrTefPreviewSummary = {
    duplicate: rows.filter((row) => row.status === "DUPLICADO").length,
    included: included.length,
    incompleteBank: rows.filter((row) => row.status === "BANCO INCOMPLETO").length,
    ready: rows.filter((row) => row.status === "LISTO").length,
    thirdPartyReview: rows.filter((row) => row.status === "CUENTA DE TERCERO / REVISAR").length,
    total: rows.length,
    totalAmount: included.reduce((sum, row) => sum + row.amount, 0),
    zeroAmount: rows.filter((row) => row.status === "SIN PAGO / $0").length
  };
  return { rows, summary };
}

export function generateHrTefWorkbook(rows: HrTefPreviewRow[]) {
  const included = rows.filter((row) => row.status === "LISTO" || row.status === "CUENTA DE TERCERO / REVISAR");
  const values: Array<Array<string | number>> = [
    [...HR_TEF_HEADERS],
    ...included.map((row) => [
      HR_TEF_ORIGIN_ACCOUNT,
      HR_TEF_CURRENCY,
      row.accountNumber,
      HR_TEF_CURRENCY,
      row.bankCode,
      row.holderRut,
      row.employeeName,
      row.amount,
      row.glosaTef,
      row.paymentEmail,
      row.glosaCorreo
    ])
  ];
  const zip = new AdmZip();
  const rowsXml = xlsxRows(values);
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`));
  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`));
  zip.addFile("xl/workbook.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PAGO" sheetId="1" r:id="rId1"/></sheets></workbook>`));
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:K${values.length}"/><sheetData>${rowsXml}</sheetData></worksheet>`));
  return zip.toBuffer();
}
