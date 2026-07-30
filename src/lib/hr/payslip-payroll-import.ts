import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { extractPayslipsFromPdf, payslipPaymentGlosa, type ParsedPayslip } from "./payroll-parser.ts";
import { normalizeRut } from "./utils.ts";

export type PayslipPayrollEmployee = {
  fullName: string;
  id: string;
  rut: string;
};

export type PayslipPayrollImportItem = {
  detectedName: string;
  detectedPeriod: string;
  detectedRut: string;
  employeeId: string | null;
  employeeName: string;
  fileName: string;
  fileSha256: string;
  glosa: string;
  importKey: string;
  matchLevel: "alta" | "media" | "revision";
  matchMethod: "rut_exacto" | "nombre_unico" | "revision_manual";
  netAmount: number;
  originalFilename: string;
  page: number;
  pagePdf: Buffer;
  paymentRequired: boolean;
  period: string;
  reviewReason: string;
  safeFilename: string;
  status: "listo" | "requiere_revision" | "duplicado" | "sin_pago";
  warnings: string[];
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function nameTokens(value: string) {
  return new Set(normalizeName(value).split(" ").filter((token) => token.length > 2));
}

function bestNameMatch(name: string, employees: PayslipPayrollEmployee[]) {
  const detected = nameTokens(name);
  if (!detected.size) return null;
  const matches = employees.filter((employee) => {
    const candidate = nameTokens(employee.fullName);
    let hits = 0;
    for (const token of detected) if (candidate.has(token)) hits += 1;
    return hits >= Math.min(3, detected.size);
  });
  return matches.length === 1 ? matches[0] : null;
}

function pageFilename(originalFilename: string, page: number) {
  const base = originalFilename.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 130) || "liquidacion";
  return `${base}_pagina_${String(page).padStart(2, "0")}.pdf`;
}

async function splitPdfPages(buffer: Buffer) {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages: Buffer[] = [];
  for (let index = 0; index < source.getPageCount(); index += 1) {
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [index]);
    target.addPage(page);
    pages.push(Buffer.from(await target.save()));
  }
  return pages;
}

function buildItem(input: {
  duplicate: boolean;
  employee: PayslipPayrollEmployee | null;
  matchLevel: PayslipPayrollImportItem["matchLevel"];
  matchMethod: PayslipPayrollImportItem["matchMethod"];
  originalFilename: string;
  pagePdf: Buffer;
  parsed: ParsedPayslip;
  reviewReason: string;
}) {
  const fileSha256 = crypto.createHash("sha256").update(input.pagePdf).digest("hex");
  const detectedRut = normalizeRut(input.parsed.rut || "");
  const period = input.parsed.period || "";
  const hasExplicitZeroNet = input.parsed.netPay === 0 && /L[IÍ]QUIDO A PAGAR|ALCANCE L[IÍ]QUIDO/i.test(input.parsed.rawText);
  const warnings = input.parsed.warnings.filter((warning) => warning !== "liquido_no_detectado" || !hasExplicitZeroNet);
  if (!period) warnings.push("periodo_no_detectado");
  if (!input.parsed.netPay && input.parsed.netPay !== 0) warnings.push("liquido_no_detectado");
  const missingRequired = !detectedRut || !period || input.parsed.netPay < 0;
  const paymentRequired = input.parsed.netPay > 0;
  const status: PayslipPayrollImportItem["status"] = input.duplicate
    ? "duplicado"
    : !input.employee || missingRequired || warnings.includes("liquido_no_detectado")
      ? "requiere_revision"
      : paymentRequired
        ? "listo"
        : "sin_pago";

  return {
    detectedName: input.parsed.fullName,
    detectedPeriod: period,
    detectedRut,
    employeeId: input.employee?.id ?? null,
    employeeName: input.employee?.fullName ?? "Sin asignar",
    fileName: pageFilename(input.originalFilename, input.parsed.page),
    fileSha256,
    glosa: period ? payslipPaymentGlosa(period) : "",
    importKey: `${input.originalFilename}::page-${input.parsed.page}`,
    matchLevel: input.matchLevel,
    matchMethod: input.matchMethod,
    netAmount: input.parsed.netPay,
    originalFilename: input.originalFilename,
    page: input.parsed.page,
    pagePdf: input.pagePdf,
    paymentRequired,
    period,
    reviewReason: input.duplicate ? "Ya importada" : input.reviewReason,
    safeFilename: pageFilename(input.originalFilename, input.parsed.page),
    status,
    warnings
  } satisfies PayslipPayrollImportItem;
}

export async function buildPayslipPayrollImportItems(input: {
  buffer: Buffer;
  duplicateHashes?: Set<string>;
  employees: PayslipPayrollEmployee[];
  filename: string;
  manualAssignments?: Map<string, string>;
}) {
  const parsedPages = extractPayslipsFromPdf(input.buffer);
  const pagePdfs = await splitPdfPages(input.buffer);
  return parsedPages.map((parsed) => {
    const pagePdf = pagePdfs[parsed.page - 1] ?? input.buffer;
    const pageHash = crypto.createHash("sha256").update(pagePdf).digest("hex");
    const manualEmployeeId = input.manualAssignments?.get(`${input.filename}::page-${parsed.page}`) ?? null;
    const manualEmployee = manualEmployeeId ? input.employees.find((employee) => employee.id === manualEmployeeId) ?? null : null;
    const rutMatch = parsed.rut ? input.employees.find((employee) => normalizeRut(employee.rut) === normalizeRut(parsed.rut)) ?? null : null;
    const nameMatch = parsed.fullName ? bestNameMatch(parsed.fullName, input.employees) : null;
    const employee = manualEmployee ?? rutMatch ?? nameMatch;
    const matchMethod = manualEmployee ? "revision_manual" : rutMatch ? "rut_exacto" : nameMatch ? "nombre_unico" : "revision_manual";
    const matchLevel = manualEmployee || nameMatch ? "media" : rutMatch ? "alta" : "revision";
    const reviewReason = employee
      ? manualEmployee
        ? "Asignacion manual confirmada"
        : ""
      : parsed.rut
        ? "RUT no coincide con trabajador activo"
        : "Coincidencia por nombre ausente o ambigua";

    return buildItem({
      duplicate: input.duplicateHashes?.has(pageHash) ?? false,
      employee,
      matchLevel,
      matchMethod,
      originalFilename: input.filename,
      pagePdf,
      parsed,
      reviewReason
    });
  });
}

export function summarizePayslipPayrollImport(items: PayslipPayrollImportItem[]) {
  const confirmable = items.filter((item) => item.status === "listo");
  return {
    associated: items.filter((item) => item.employeeId).length,
    duplicates: items.filter((item) => item.status === "duplicado").length,
    needsReview: items.filter((item) => item.status === "requiere_revision").length,
    ready: confirmable.length,
    total: items.length,
    totalPayable: confirmable.reduce((sum, item) => sum + item.netAmount, 0),
    zeroNet: items.filter((item) => item.status === "sin_pago").length
  };
}
