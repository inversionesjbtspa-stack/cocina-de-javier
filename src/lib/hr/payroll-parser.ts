import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import AdmZip from "adm-zip";

export type ParsedPayslip = {
  page: number;
  period: string;
  monthLabel: string;
  rut: string;
  fullName: string;
  position: string;
  section: string;
  hireDate: string | null;
  baseSalary: number;
  workedDays: number;
  totalTaxable: number;
  totalNonTaxable: number;
  totalEarnings: number;
  totalDiscounts: number;
  netPay: number;
  afp: string | null;
  health: string | null;
  advances: number;
  productionBonus: number;
  responsibilityBonus: number;
  compensatoryBonus: number;
  overtime: number;
  sundaySurcharge: number;
  ccafDiscount: number;
  uniqueTax: number;
  additionalHealth: number;
  rawText: string;
  warnings: string[];
};

export type AccountantRow = {
  sheetName: string;
  rowNumber: number;
  fullName: string;
  rut: string;
  costCenter: string;
  position: string;
  baseSalary: number;
  absences: number;
  licenses: number;
  reason: string;
  overtimeHours: number;
  aguinaldo: number;
  productionBonus: number;
  compensatoryBonus: number;
  sundaySurcharge: number;
  responsibilityBonus: number;
  movilization: number;
  phoneAllowance: number;
  cashAllowance: number;
  advances: number;
  companyLoan: number;
  ccafLoan: number;
  discounts: number;
  observations: string;
  raw: Record<string, string | number>;
};

const monthMap: Record<string, string> = {
  ABRIL: "04",
  ENERO: "01",
  FEBRERO: "02",
  MARZO: "03",
  MAYO: "05",
  JUNIO: "06",
  JULIO: "07",
  AGOSTO: "08",
  SEPTIEMBRE: "09",
  OCTUBRE: "10",
  NOVIEMBRE: "11",
  DICIEMBRE: "12"
};

function unescapePdf(value: string) {
  return value
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n");
}

function pdfStrings(stream: string) {
  return [...stream.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)].map((match) => unescapePdf(match[0].replace(/\)\s*Tj$/, "").slice(1)));
}

function amount(value: string | undefined | null) {
  if (!value) return 0;
  const normalized = value.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueAfter(strings: string[], label: string) {
  const index = strings.findIndex((item) => item.trim().toUpperCase() === label.toUpperCase());
  return index >= 0 ? strings[index + 1]?.trim() ?? "" : "";
}

function lineAmount(strings: string[], label: RegExp) {
  const index = strings.findIndex((item) => label.test(item.trim().toUpperCase()));
  if (index < 0) return 0;
  return amount(strings[index + 1]);
}

function textLine(strings: string[], label: RegExp) {
  const found = strings.find((item) => label.test(item.trim().toUpperCase()));
  return found?.trim() ?? "";
}

function isoDate(value: string) {
  const match = value.match(/(\d{2})-(\d{2})-(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function periodFrom(monthLabel: string) {
  const match = monthLabel.toUpperCase().match(/([A-ZÁÉÍÓÚÑ]+)\s+DE\s+(\d{4})/);
  if (!match) return "2026-04";
  return `${match[2]}-${monthMap[match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? "04"}`;
}

function parseStream(stream: string, page: number): ParsedPayslip | null {
  const strings = pdfStrings(stream).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  const monthLabel = valueAfter(strings, "MES :");
  const fullName = valueAfter(strings, "NOMBRE :");
  const rut = valueAfter(strings, "RUT :");
  if (!fullName || !rut) return null;
  const baseLine = textLine(strings, /^SUELDO BASE MENSUAL/);
  const workedLine = textLine(strings, /^DÍAS TRABAJADOS|^DIAS TRABAJADOS/);
  const afpLine = strings.find((item) => /\[[\d,.]+%\]/.test(item) && !item.toUpperCase().includes("SALUD")) ?? null;
  const healthLine = strings.find((item) => item.toUpperCase().startsWith("SALUD")) ?? null;
  const warnings = [];
  const netPay = lineAmount(strings, /L[IÍ]QUIDO A PAGAR|ALCANCE L[IÍ]QUIDO/);
  if (!netPay) warnings.push("liquido_no_detectado");

  return {
    additionalHealth: lineAmount(strings, /SALUD - .*ADICIONAL|ADICIONAL SALUD/),
    advances: lineAmount(strings, /^ANTICIPOS/),
    afp: afpLine?.replace(/\s*\[[^\]]+\].*$/, "") ?? null,
    baseSalary: amount(baseLine.match(/\[([^\]]+)\]/)?.[1]) || lineAmount(strings, /^SUELDO BASE MENSUAL/),
    ccafDiscount: lineAmount(strings, /CAJA|CCAF|CR[EÉ]DITO SOCIAL/),
    compensatoryBonus: lineAmount(strings, /BONO COMPENSATORIO/),
    fullName,
    health: healthLine?.replace(/\s*\[[^\]]+\].*$/, "") ?? null,
    hireDate: isoDate(valueAfter(strings, "FEC. CONTRATO :")),
    monthLabel,
    netPay,
    overtime: lineAmount(strings, /HORAS EXTRA/),
    page,
    period: periodFrom(monthLabel),
    position: valueAfter(strings, "CARGO :"),
    productionBonus: lineAmount(strings, /BONO PRODUCCION|BONO PRODUCCIÓN/),
    rawText: strings.join("\n"),
    responsibilityBonus: lineAmount(strings, /BONO RESPONSABILIDAD/),
    rut,
    section: valueAfter(strings, "SECCIÓN :"),
    sundaySurcharge: lineAmount(strings, /RECARGO HRS DOMINGOS|RECARGO DOMINGOS/),
    totalDiscounts: lineAmount(strings, /TOTAL DESCUENTOS/),
    totalEarnings: lineAmount(strings, /TOTAL HABERES/),
    totalNonTaxable: lineAmount(strings, /TOTAL NO IMPONIBLE/),
    totalTaxable: lineAmount(strings, /TOTAL IMPONIBLE/),
    uniqueTax: lineAmount(strings, /IMPUESTO ÚNICO|IMPUESTO UNICO/),
    warnings,
    workedDays: amount(workedLine.match(/\[([\d,.]+)\//)?.[1]) || 0
  };
}

export function extractPayslipsFromPdf(buffer: Buffer): ParsedPayslip[] {
  const pdf = buffer.toString("latin1");
  const payslips: ParsedPayslip[] = [];
  let page = 0;
  for (const match of pdf.matchAll(/<<(?:.|\n|\r)*?\/Filter\s*\/FlateDecode(?:.|\n|\r)*?>>\s*stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf("endstream", start);
    if (end < 0) continue;
    const raw = Buffer.from(pdf.slice(start, end).replace(/\r?\n$/, ""), "latin1");
    try {
      const stream = zlib.inflateSync(raw).toString("latin1");
      const parsed = parseStream(stream, ++page);
      if (parsed) payslips.push(parsed);
    } catch {
      page += 1;
    }
  }
  return payslips;
}

function sharedStrings(zip: AdmZip) {
  const entry = zip.getEntry("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = entry.getData().toString("utf8");
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => text[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n"))
      .join("")
  );
}

function cellValue(cellXml: string, strings: string[]) {
  const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (/t="s"/.test(cellXml)) return strings[Number(value)] ?? "";
  return value;
}

function num(value: string | number | undefined) {
  const parsed = Number(String(value ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

const columnLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function excelColumn(index: number) {
  let column = "";
  let cursor = index + 1;
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return column;
}

function headerIndexes(headers: string[]) {
  const used: Record<string, number> = {};
  const find = (patterns: RegExp[], occurrence = 1) => {
    let seen = 0;
    for (let index = 0; index < headers.length; index += 1) {
      if (patterns.some((pattern) => pattern.test(headers[index]))) {
        seen += 1;
        if (seen === occurrence) return index;
      }
    }
    return -1;
  };
  const next = (key: string, patterns: RegExp[]) => {
    used[key] = (used[key] ?? 0) + 1;
    return find(patterns, used[key]);
  };
  return { find, next };
}

function rowByHeader(cells: Record<string, string>, index: number) {
  if (index < 0) return "";
  return cells[excelColumn(index)] ?? "";
}

export function parseAccountantWorkbook(buffer: Buffer): AccountantRow[] {
  const zip = new AdmZip(buffer);
  const strings = sharedStrings(zip);
  const workbook = zip.getEntry("xl/workbook.xml")?.getData().toString("utf8") ?? "";
  const sheetNames = [...workbook.matchAll(/<sheet name="([^"]+)"[^>]*sheetId="(\d+)"/g)].map((match) => ({ id: match[2], name: match[1] }));
  const rows: AccountantRow[] = [];
  for (const sheet of sheetNames.slice(0, 2)) {
    const xml = zip.getEntry(`xl/worksheets/sheet${sheet.id}.xml`)?.getData().toString("utf8");
    if (!xml) continue;
    let headers: string[] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[\s\S]*?<\/row>/g)) {
      const rowNumber = Number(rowMatch[1]);
      const cells: Record<string, string> = {};
      for (const cell of rowMatch[0].matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?<\/c>/g)) {
        cells[cell[1]] = cellValue(cell[0], strings);
      }
      if (rowNumber <= 5) {
        if (rowNumber === 5) {
          headers = columnLetters.map((column) => normalizeHeader(cells[column] ?? ""));
        }
        continue;
      }
      if (!cells.A || !cells.B) continue;
      const map = headerIndexes(headers);
      const absencesIndex = map.find([/^INASISTENCIAS$/]);
      const licensesIndex = map.find([/^LICENCIAS$/]);
      const reasonIndex = map.find([/^MOTIVO$/]);
      const overtimeIndex = map.find([/^HORAS EXTRAS$/]);
      const firstAguinaldoIndex = map.next("aguinaldo", [/^AGUINALDO$/]);
      const secondAguinaldoIndex = map.next("aguinaldo", [/^AGUINALDO$/]);
      const productionBonusIndex = map.find([/^BONO PRODUCCION$/]);
      const firstCompIndex = map.next("compensatory", [/^BONO COMP/]);
      const secondCompIndex = map.next("compensatory", [/^BONO COMP/]);
      const sundayIndex = map.find([/^RECARGO DOMINGO$/]);
      const responsibilityIndex = map.find([/^BONO RESPONSABILIDAD$/]);
      const movilizationIndex = map.find([/^MOVILIZACION$/]);
      const phoneIndex = map.find([/^ASIG\.? TELEFONO$/]);
      const cashIndex = map.find([/^CAJA$/]);
      const advancesIndex = map.find([/^ANTICIPOS$/]);
      const advanceAguinaldoIndex = map.find([/^ANTICIPO AGUINALDO$/]);
      const companyLoanIndex = map.find([/^PTMO EMPRESA$/, /^PRESTAMO EMPRESA$/]);
      const ccafIndex = map.find([/^PRESTAMO CAJA$/]);
      const lateAguinaldoIndex = map.find([/^AGUINALDO$/], 3);
      const lateAdvanceAguinaldoIndex = map.find([/^ANTICIPO AGUINALDO$/], 2);
      rows.push({
        absences: num(rowByHeader(cells, absencesIndex)),
        advances: num(rowByHeader(cells, advancesIndex)) + num(rowByHeader(cells, advanceAguinaldoIndex)) + num(rowByHeader(cells, lateAdvanceAguinaldoIndex)),
        aguinaldo: num(rowByHeader(cells, firstAguinaldoIndex)) + num(rowByHeader(cells, secondAguinaldoIndex)) + num(rowByHeader(cells, lateAguinaldoIndex)),
        baseSalary: 0,
        cashAllowance: num(rowByHeader(cells, cashIndex)),
        ccafLoan: num(rowByHeader(cells, ccafIndex)),
        compensatoryBonus: num(rowByHeader(cells, firstCompIndex)) + num(rowByHeader(cells, secondCompIndex)),
        companyLoan: num(rowByHeader(cells, companyLoanIndex)),
        costCenter: rowByHeader(cells, 2),
        discounts: num(rowByHeader(cells, companyLoanIndex)) + num(rowByHeader(cells, ccafIndex)),
        fullName: cells.A,
        licenses: num(rowByHeader(cells, licensesIndex)),
        movilization: num(rowByHeader(cells, movilizationIndex)),
        observations: "",
        overtimeHours: num(rowByHeader(cells, overtimeIndex)),
        phoneAllowance: num(rowByHeader(cells, phoneIndex)),
        position: "",
        productionBonus: num(rowByHeader(cells, productionBonusIndex)),
        raw: cells,
        reason: rowByHeader(cells, reasonIndex),
        responsibilityBonus: num(rowByHeader(cells, responsibilityIndex)),
        rowNumber,
        rut: cells.B,
        sheetName: sheet.name,
        sundaySurcharge: num(rowByHeader(cells, sundayIndex))
      });
    }
  }
  return rows;
}

export function generatePayslipPdf(payslip: ParsedPayslip) {
  const lines = [
    ["Trabajador", payslip.fullName],
    ["RUT", payslip.rut],
    ["Cargo", payslip.position],
    ["Seccion", payslip.section],
    ["Periodo", payslip.monthLabel],
    ["Sueldo base", String(payslip.baseSalary)],
    ["Dias trabajados", String(payslip.workedDays)],
    ["Total imponible", String(payslip.totalTaxable)],
    ["Total no imponible", String(payslip.totalNonTaxable)],
    ["Total haberes", String(payslip.totalEarnings)],
    ["Total descuentos", String(payslip.totalDiscounts)],
    ["Liquido a pagar", String(payslip.netPay)]
  ];
  const text = (x: number, y: number, value: string, size = 10) => `0.18 0.10 0.12 rg BT /F1 ${size} Tf ${x} ${y} Td (${value.replace(/[()\\]/g, "")}) Tj ET`;
  const content = [
    "0.43 0.09 0.16 rg 0 760 612 82 re f",
    "1 1 1 rg BT /F2 17 Tf 46 807 Td (LA COCINA DE JAVIER) Tj ET",
    "0.96 0.90 0.86 rg BT /F1 10 Tf 46 785 Td (Liquidacion individual generada desde PDF abril 2026) Tj ET",
    ...lines.map(([label, value], index) => text(52, 720 - index * 28, `${label}: ${value}`))
  ].join("\n");
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
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

export const accountantTemplatePath = path.join(process.cwd(), "src", "templates", "datos-sueldos-template.xlsx");

export function assertAccountantTemplateAvailable() {
  if (!fs.existsSync(accountantTemplatePath)) {
    throw new Error("Template Datos Sueldos no existe en el proyecto.");
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineCell(column: string, row: number, value: string | number) {
  if (typeof value === "number") {
    return `<c r="${column}${row}"><v>${value}</v></c>`;
  }
  return `<c r="${column}${row}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function accountantRowXml(rowNumber: number, row: AccountantRow) {
  return `<row r="${rowNumber}">` +
    inlineCell("A", rowNumber, row.fullName) +
    inlineCell("B", rowNumber, row.rut) +
    inlineCell("C", rowNumber, row.costCenter) +
    inlineCell("D", rowNumber, row.absences) +
    inlineCell("E", rowNumber, row.licenses) +
    inlineCell("F", rowNumber, row.reason) +
    inlineCell("G", rowNumber, row.overtimeHours) +
    inlineCell("H", rowNumber, row.aguinaldo) +
    inlineCell("I", rowNumber, 0) +
    inlineCell("J", rowNumber, row.productionBonus) +
    inlineCell("K", rowNumber, 0) +
    inlineCell("L", rowNumber, row.compensatoryBonus) +
    inlineCell("M", rowNumber, row.sundaySurcharge) +
    inlineCell("N", rowNumber, row.responsibilityBonus) +
    inlineCell("O", rowNumber, row.movilization) +
    inlineCell("P", rowNumber, row.phoneAllowance) +
    inlineCell("Q", rowNumber, row.cashAllowance) +
    inlineCell("R", rowNumber, row.advances) +
    inlineCell("S", rowNumber, 0) +
    inlineCell("T", rowNumber, row.companyLoan) +
    inlineCell("U", rowNumber, row.ccafLoan) +
    inlineCell("V", rowNumber, 0) +
    inlineCell("W", rowNumber, 0) +
    "</row>";
}

export function generateAccountantWorkbook(rows: AccountantRow[]) {
  assertAccountantTemplateAvailable();
  const zip = new AdmZip(accountantTemplatePath);
  const entry = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!entry) throw new Error("Template Datos Sueldos no contiene sheet1.xml.");
  const xml = entry.getData().toString("utf8");
  const headerRows = [...xml.matchAll(/<row[^>]*r="([1-5])"[\s\S]*?<\/row>/g)].map((match) => match[0]).join("");
  const bodyRows = rows.map((row, index) => accountantRowXml(index + 6, row)).join("");
  const maxRow = rows.length + 5;
  const updated = xml
    .replace(/<dimension ref="[^"]*"/, `<dimension ref="A1:W${Math.max(maxRow, 6)}"`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerRows}${bodyRows}</sheetData>`);
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(updated, "utf8"));
  return zip.toBuffer();
}
