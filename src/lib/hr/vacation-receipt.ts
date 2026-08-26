import crypto from "node:crypto";
import type { HrCompanyConfig } from "./company-config.ts";
import { businessDaysInclusive } from "./utils.ts";

export type VacationPeriodAllocation = {
  allocatedDays?: number;
  allocationOrder?: number;
  balanceAfter?: number;
  balanceBefore?: number;
  daysUsed?: number;
  period?: string;
  periodEnd?: string | null;
  periodStart?: string | null;
  previousBalance?: number;
  resultingBalance?: number;
};

export type VacationReceiptEmployee = {
  area?: string | null;
  contractType?: string | null;
  costCenter?: string | null;
  fullName: string;
  hireDate?: string | null;
  id?: string | null;
  position?: string | null;
  rut: string;
};

export type VacationReceiptInput = {
  allocations?: VacationPeriodAllocation[];
  approvedByName?: string;
  businessDays: number;
  company: HrCompanyConfig;
  contractPeriodEnd?: string | null;
  contractPeriodStart?: string | null;
  documentDate?: string | null;
  employee: VacationReceiptEmployee;
  endDate: string;
  fractionalVacation?: boolean | null;
  id: string;
  nonBusinessDays?: number | null;
  note?: string | null;
  previousBalance: number;
  progressiveDays?: number | null;
  projectedProportional?: number | null;
  receiptNumber?: string | null;
  returnToWorkDate?: string | null;
  requestedStatus?: string | null;
  resultingBalance: number;
  startDate: string;
};

export type VacationReceiptModel = ReturnType<typeof buildVacationReceiptModel>;

function dateValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatChileDate(value: string | null | undefined) {
  if (!value) return "No informado";
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function nonBusinessDaysInclusive(startDate: string, endDate: string) {
  const start = dateValue(startDate);
  const end = dateValue(endDate);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return 0;
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day === 0 || day === 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function nextBusinessDateAfter(value: string) {
  let cursor = addDays(dateValue(value), 1);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor = addDays(cursor, 1);
  return isoDate(cursor);
}

export function sanitizeVacationFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, " ").trim();
}

export function vacationReceiptNumber(requestId: string, documentDate: string) {
  const year = documentDate.slice(0, 4);
  const suffix = requestId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `FER-${year}-${suffix}`;
}

function allocationDays(item: VacationPeriodAllocation) {
  return Number(item.daysUsed ?? item.allocatedDays ?? 0);
}

function allocationBalanceBefore(item: VacationPeriodAllocation) {
  return Number(item.balanceBefore ?? item.previousBalance ?? 0);
}

function allocationBalanceAfter(item: VacationPeriodAllocation) {
  return Number(item.balanceAfter ?? item.resultingBalance ?? 0);
}

function allocationPeriodLabel(item: VacationPeriodAllocation) {
  if (item.periodStart && item.periodEnd) return `${formatChileDate(item.periodStart)} / ${formatChileDate(item.periodEnd)}`;
  return item.period || "";
}

function normalizeAllocations(input: VacationPeriodAllocation[] | undefined, fallback: VacationPeriodAllocation) {
  const allocations = input?.length ? input : [fallback];
  return allocations.map((item) => ({
    ...item,
    balanceAfter: allocationBalanceAfter(item),
    balanceBefore: allocationBalanceBefore(item),
    daysUsed: allocationDays(item),
    period: allocationPeriodLabel(item) || item.period || "Periodo no informado"
  }));
}

function contractPeriodFromModel(model: Pick<VacationReceiptModel, "allocations" | "contractPeriodEnd" | "contractPeriodStart">) {
  const firstAllocation = model.allocations[0];
  return {
    end: model.contractPeriodEnd || firstAllocation?.periodEnd || null,
    start: model.contractPeriodStart || firstAllocation?.periodStart || null
  };
}

export function buildVacationReceiptModel(input: VacationReceiptInput) {
  const documentDate = input.documentDate || isoDate(new Date());
  const receiptNumber = input.receiptNumber || vacationReceiptNumber(input.id, documentDate);
  const nonBusinessDays = input.nonBusinessDays ?? nonBusinessDaysInclusive(input.startDate, input.endDate);
  const reincorporationDate = input.returnToWorkDate || nextBusinessDateAfter(input.endDate);
  const allocations = normalizeAllocations(input.allocations, {
    balanceAfter: input.resultingBalance,
    balanceBefore: input.previousBalance,
    daysUsed: input.businessDays,
    periodEnd: input.contractPeriodEnd,
    periodStart: input.contractPeriodStart
  });
  const vacationKind = input.resultingBalance <= 0 ? "TOTAL" : "PARCIAL";
  const filename = `Comprobante vacaciones - ${sanitizeVacationFilename(input.employee.fullName)} - ${documentDate} - ${receiptNumber}.pdf`;

  return {
    ...input,
    allocations,
    businessDays: input.businessDays || businessDaysInclusive(input.startDate, input.endDate),
    documentDate,
    filename,
    fractionalVacationLabel: input.fractionalVacation ? "Si" : "No",
    legalNote: input.note || "Para el calculo del feriado legal se consideran dias habiles de lunes a viernes. Sabados, domingos, festivos y otros dias inhabiles acreditados no se descuentan. Uno de estos ejemplares queda en poder del trabajador y otro en poder del empleador.",
    nonBusinessDays,
    progressiveDays: input.progressiveDays ?? 0,
    projectedProportional: input.projectedProportional ?? 0,
    receiptNumber,
    reincorporationDate,
    statusLabel: input.requestedStatus || "borrador",
    vacationKind
  };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderVacationReceiptHtml(model: VacationReceiptModel) {
  const contractPeriod = contractPeriodFromModel(model);
  const allocationNote = model.allocations.map((item) => `${escapeHtml(item.period)}: ${formatDays(item.daysUsed)} dias`).join(" · ");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.receiptNumber)} - Comprobante de feriado</title>
<style>
  :root { --ink:#111; --muted:#333; --line:#111; --soft:#777; }
  * { box-sizing: border-box; }
  body { margin:0; background:#ececec; color:var(--ink); font-family: Arial, Helvetica, sans-serif; }
  .toolbar { display:flex; justify-content:center; gap:10px; padding:16px; }
  .toolbar button { border:1px solid #333; border-radius:4px; background:white; color:#111; cursor:pointer; font-weight:700; padding:8px 14px; }
  .page { width:297mm; min-height:210mm; margin:20px auto; background:white; padding:13mm 15mm; box-shadow:0 8px 26px rgba(0,0,0,.14); }
  .header { display:grid; grid-template-columns:minmax(0, 1fr) 210px; gap:24px; align-items:start; }
  .company { font-size:12px; line-height:1.5; }
  .company-row { display:grid; grid-template-columns:96px minmax(0, 1fr); gap:10px; min-height:18px; }
  .company-row span { font-weight:700; }
  .date { font-size:12px; text-align:left; }
  .date strong { display:block; font-size:11px; margin-top:8px; }
  h1 { font-size:18px; margin:18px 0 16px; text-align:center; text-decoration:underline; }
  .period { font-size:13px; line-height:1.7; text-align:center; }
  .period-dates { display:flex; justify-content:center; gap:42px; margin-top:2px; }
  .intro { font-size:12.5px; line-height:1.55; margin:18px 0 4px; max-width:100%; }
  .worker { display:grid; grid-template-columns:42px 1fr auto; gap:10px; align-items:end; font-size:13px; margin:2px 0 18px; }
  .line-value { border-bottom:1px solid var(--line); min-height:22px; padding:0 4px 3px; font-weight:700; }
  .worker-rut { color:var(--muted); font-size:11px; white-space:nowrap; }
  .rest-title { font-size:12px; font-weight:700; margin:18px 0 8px; text-align:center; text-decoration:underline; }
  .rest-dates { display:flex; justify-content:center; gap:70px; font-size:13px; font-weight:700; margin-bottom:20px; }
  .body-grid { display:grid; grid-template-columns:390px 1px minmax(280px, 1fr); gap:30px; align-items:start; }
  .separator { background:#111; height:150px; margin-top:8px; width:1px; }
  .detail-title { display:grid; grid-template-columns:1fr 70px; font-size:12px; font-weight:700; margin-bottom:6px; }
  .detail-row { display:grid; grid-template-columns:1fr 70px; gap:12px; font-size:12px; min-height:24px; align-items:center; }
  .detail-row span:first-child { font-weight:700; }
  .detail-row span:last-child { border-bottom:1px solid var(--line); min-height:19px; text-align:center; }
  .period-note { color:var(--soft); font-size:9.5px; line-height:1.35; margin-top:8px; }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:34px; margin-top:56px; }
  .signature { border-top:1px solid var(--line); font-size:11px; padding-top:7px; text-align:center; }
  .note { color:#222; font-size:9.5px; line-height:1.35; margin-top:22px; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print {
    body { background:white; }
    .toolbar { display:none; }
    .page { box-shadow:none; margin:0; padding:0; width:auto; min-height:auto; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
<main class="page">
  <section class="header">
    <div class="company">
      <div class="company-row"><span>Razon Social:</span><strong>${escapeHtml(model.company.legalName)}</strong></div>
      <div class="company-row"><span>R.U.T.:</span><strong>${escapeHtml(model.company.rut)}</strong></div>
      <div class="company-row"><span>Direccion:</span><strong>${escapeHtml(model.company.address || "No informado")}</strong></div>
      <div class="company-row"><span>Telefono:</span><strong>${escapeHtml(model.company.phone || "No informado")}</strong></div>
    </div>
    <div class="date">
      <div><strong>Fecha:</strong> ${formatChileDate(model.documentDate)}</div>
      <strong>${escapeHtml(model.receiptNumber)}</strong>
    </div>
  </section>
  <h1>COMPROBANTE DE FERIADO</h1>
  <section class="period">
    <div>Correspondiente al Periodo Contractual:</div>
    <div class="period-dates"><span>Del ${formatChileDate(contractPeriod.start)}</span><span>Al ${formatChileDate(contractPeriod.end)}</span></div>
  </section>
  <p class="intro">En cumplimiento a las disposiciones legales vigentes se deja constancia que a contar de las fechas que se indican, el trabajador</p>
  <div class="worker"><strong>Don:</strong><div class="line-value">${escapeHtml(model.employee.fullName)}</div><div class="worker-rut">RUT: ${escapeHtml(model.employee.rut || "No informado")}</div></div>
  <p class="intro">Hara uso de su feriado <strong>${model.vacationKind}</strong> con remuneracion integra, de acuerdo al detalle que se indica a continuacion.</p>
  <div class="rest-title">DESCANSO EFECTIVO ENTRE LAS FECHAS QUE SE INDICAN</div>
  <div class="rest-dates"><span>DESDE EL ${formatChileDate(model.startDate)}</span><span>AL ${formatChileDate(model.endDate)}</span></div>
  <section class="body-grid">
    <div>
      <div class="detail-title"><span>DETALLE DEL FERIADO</span><span>DIAS</span></div>
      <div class="detail-row"><span>DIAS HABILES</span><span>${formatDays(model.businessDays)}</span></div>
      <div class="detail-row"><span>VAC. PROGRESIVAS</span><span>${formatDays(model.progressiveDays)}</span></div>
      <div class="detail-row"><span>DOMINGOS E INHABILES</span><span>${formatDays(model.nonBusinessDays)}</span></div>
      <div class="detail-row"><span>FERIADO FRACCIONADO</span><span>${escapeHtml(model.fractionalVacationLabel)}</span></div>
      <div class="detail-row"><span>SALDO PENDIENTE</span><span>${formatDays(model.resultingBalance)}</span></div>
      ${allocationNote ? `<div class="period-note">Imputacion FIFO: ${allocationNote}</div>` : ""}
    </div>
    <div class="separator"></div>
    <div class="signatures"><div class="signature">Firma Empleador o Rep. Legal</div><div class="signature">Firma del trabajador</div></div>
  </section>
  <p class="note"><strong>NOTA:</strong> ${escapeHtml(model.legalNote)}</p>
</main>
</body>
</html>`;
}

function pdfText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderVacationReceiptPdf(model: VacationReceiptModel) {
  const contractPeriod = contractPeriodFromModel(model);
  const allocationNote = model.allocations.map((item) => `${item.period}: ${formatDays(item.daysUsed)} dias`).join(" | ");
  const text = (x: number, y: number, size: number, value: string, font = "F1") => `0 0 0 rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
  const line = (x1: number, y1: number, x2: number, y2: number) => `0 0 0 RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`;
  const note = `NOTA: ${model.legalNote}`;
  const content = [
    text(42, 548, 10, "Razon Social:", "F2"),
    text(132, 548, 10, model.company.legalName, "F2"),
    text(42, 530, 10, "R.U.T.:", "F2"),
    text(132, 530, 10, model.company.rut || "No informado", "F2"),
    text(42, 512, 10, "Direccion:", "F2"),
    text(132, 512, 10, model.company.address || "No informado", "F2"),
    text(42, 494, 10, "Telefono:", "F2"),
    text(132, 494, 10, model.company.phone || "No informado", "F2"),
    text(648, 548, 10, `Fecha: ${formatChileDate(model.documentDate)}`, "F1"),
    text(648, 530, 8, model.receiptNumber, "F1"),
    text(318, 464, 16, "COMPROBANTE DE FERIADO", "F2"),
    line(318, 459, 523, 459),
    text(300, 432, 11, "Correspondiente al Periodo Contractual:", "F1"),
    text(268, 410, 11, `Del ${formatChileDate(contractPeriod.start)}`, "F2"),
    text(448, 410, 11, `Al ${formatChileDate(contractPeriod.end)}`, "F2"),
    text(42, 374, 10, "En cumplimiento a las disposiciones legales vigentes se deja constancia que a contar de las fechas que se indican, el trabajador", "F1"),
    text(42, 346, 11, "Don:", "F2"),
    line(80, 344, 590, 344),
    text(86, 349, 11, model.employee.fullName, "F2"),
    text(612, 349, 8, `RUT: ${model.employee.rut || "No informado"}`, "F1"),
    text(42, 314, 10, `Hara uso de su feriado ${model.vacationKind} con remuneracion integra, de acuerdo al detalle que se indica a continuacion.`, "F1"),
    text(244, 278, 10, "DESCANSO EFECTIVO ENTRE LAS FECHAS QUE SE INDICAN", "F2"),
    line(244, 274, 596, 274),
    text(238, 250, 11, `DESDE EL ${formatChileDate(model.startDate)}`, "F2"),
    text(450, 250, 11, `AL ${formatChileDate(model.endDate)}`, "F2"),
    text(58, 212, 10, "DETALLE DEL FERIADO", "F2"),
    text(330, 212, 10, "DIAS", "F2"),
    text(58, 188, 10, "DIAS HABILES", "F2"),
    line(315, 185, 380, 185),
    text(342, 189, 10, formatDays(model.businessDays), "F1"),
    text(58, 164, 10, "VAC. PROGRESIVAS", "F2"),
    line(315, 161, 380, 161),
    text(342, 165, 10, formatDays(model.progressiveDays), "F1"),
    text(58, 140, 10, "DOMINGOS E INHABILES", "F2"),
    line(315, 137, 380, 137),
    text(342, 141, 10, formatDays(model.nonBusinessDays), "F1"),
    text(58, 116, 10, "FERIADO FRACCIONADO", "F2"),
    line(315, 113, 380, 113),
    text(338, 117, 10, model.fractionalVacationLabel, "F1"),
    text(58, 92, 10, "SALDO PENDIENTE", "F2"),
    line(315, 89, 380, 89),
    text(338, 93, 10, formatDays(model.resultingBalance), "F1"),
    allocationNote ? text(58, 72, 7, `Imputacion FIFO: ${allocationNote.slice(0, 135)}`, "F1") : "",
    line(422, 220, 422, 78),
    line(482, 162, 638, 162),
    line(666, 162, 818, 162),
    text(498, 144, 9, "Firma Empleador o Rep. Legal", "F1"),
    text(696, 144, 9, "Firma del trabajador", "F1"),
    text(42, 42, 7, note.slice(0, 150), "F1"),
    text(42, 30, 7, note.slice(150, 300), "F1")
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
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

export function vacationReceiptHash(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
