import crypto from "node:crypto";
import type { HrCompanyConfig } from "./company-config.ts";
import { businessDaysInclusive } from "./utils.ts";

export type VacationPeriodAllocation = {
  balanceAfter: number;
  balanceBefore: number;
  daysUsed: number;
  period: string;
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

export function buildVacationReceiptModel(input: VacationReceiptInput) {
  const documentDate = input.documentDate || isoDate(new Date());
  const receiptNumber = input.receiptNumber || vacationReceiptNumber(input.id, documentDate);
  const nonBusinessDays = input.nonBusinessDays ?? nonBusinessDaysInclusive(input.startDate, input.endDate);
  const reincorporationDate = input.returnToWorkDate || nextBusinessDateAfter(input.endDate);
  const allocations = input.allocations?.length ? input.allocations : [{
    balanceAfter: input.resultingBalance,
    balanceBefore: input.previousBalance,
    daysUsed: input.businessDays,
    period: `${input.contractPeriodStart ?? "Periodo"} / ${input.contractPeriodEnd ?? "sin cierre"}`
  }];
  const vacationKind = input.resultingBalance <= 0 ? "TOTAL" : "PARCIAL";
  const filename = `Comprobante vacaciones - ${sanitizeVacationFilename(input.employee.fullName)} - ${documentDate} - ${receiptNumber}.pdf`;

  return {
    ...input,
    allocations,
    businessDays: input.businessDays || businessDaysInclusive(input.startDate, input.endDate),
    documentDate,
    filename,
    fractionalVacationLabel: input.fractionalVacation ? "Si" : "",
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

function kv(label: string, value: string | number | null | undefined) {
  return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "No informado")}</strong></div>`;
}

export function renderVacationReceiptHtml(model: VacationReceiptModel) {
  const allocationRows = model.allocations.map((item) => `<tr><td>${escapeHtml(item.period)}</td><td>${formatDays(item.balanceBefore)}</td><td>${formatDays(item.daysUsed)}</td><td>${formatDays(item.balanceAfter)}</td></tr>`).join("");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.receiptNumber)} - Comprobante de feriado</title>
<style>
  :root { --ink:#24191a; --muted:#6d625d; --line:#cdbfb3; --paper:#fffaf2; --brand:#6e1730; }
  * { box-sizing: border-box; }
  body { margin:0; background:#eee7dc; color:var(--ink); font-family: Arial, Helvetica, sans-serif; }
  .toolbar { display:flex; justify-content:center; gap:10px; padding:16px; }
  .toolbar button { border:1px solid var(--brand); border-radius:6px; background:white; color:var(--brand); cursor:pointer; font-weight:700; padding:9px 14px; }
  .page { width:8.5in; min-height:11in; margin:20px auto; background:white; padding:0.58in 0.62in; box-shadow:0 10px 28px rgba(0,0,0,.16); }
  .top { border:1px solid var(--line); display:grid; grid-template-columns:1.2fr .8fr; min-height:118px; }
  .company { padding:16px 18px; }
  .company h1 { font-size:18px; letter-spacing:.02em; margin:0 0 12px; }
  .meta { border-left:1px solid var(--line); padding:16px 18px; }
  .meta .number { color:var(--brand); font-size:17px; font-weight:800; }
  .kv { display:grid; grid-template-columns:128px 1fr; gap:8px; font-size:11px; line-height:1.45; }
  .kv span { color:var(--muted); font-weight:700; text-transform:uppercase; }
  .kv strong { font-weight:700; }
  .title { margin:22px 0 12px; text-align:center; }
  .title h2 { border-bottom:2px solid var(--brand); display:inline-block; font-size:20px; margin:0; padding:0 18px 5px; }
  .intro { font-size:13px; line-height:1.62; margin:12px 0 16px; text-align:justify; }
  .box { border:1px solid var(--line); margin-top:12px; padding:14px 16px; }
  .box h3 { color:var(--brand); font-size:12px; letter-spacing:.06em; margin:0 0 10px; text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:7px 18px; }
  table { border-collapse:collapse; width:100%; }
  th, td { border:1px solid var(--line); font-size:11px; padding:7px 8px; text-align:left; }
  th { background:var(--paper); color:var(--brand); text-transform:uppercase; }
  .balance { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:10px; }
  .balance div { background:var(--paper); border:1px solid var(--line); padding:8px; }
  .balance span { color:var(--muted); display:block; font-size:10px; font-weight:700; text-transform:uppercase; }
  .balance strong { font-size:15px; }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:80px; margin-top:52px; }
  .signature { border-top:1px solid var(--ink); padding-top:8px; text-align:center; font-size:12px; }
  .note { border-top:1px solid var(--line); color:var(--muted); font-size:10.5px; line-height:1.45; margin-top:22px; padding-top:10px; }
  .status { border:1px solid var(--line); border-radius:999px; display:inline-block; font-size:10px; font-weight:800; padding:4px 9px; text-transform:uppercase; }
  @page { size: letter; margin: 0.45in; }
  @media print {
    body { background:white; }
    .toolbar { display:none; }
    .page { box-shadow:none; margin:0; padding:0; width:auto; min-height:auto; }
    .box, table, .signatures { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
<main class="page">
  <section class="top">
    <div class="company">
      <h1>${escapeHtml(model.company.legalName)}</h1>
      ${kv("Razon social", model.company.legalName)}
      ${kv("RUT empresa", model.company.rut)}
      ${kv("Direccion", model.company.address)}
      ${kv("Telefono", model.company.phone)}
    </div>
    <div class="meta">
      <p class="number">${escapeHtml(model.receiptNumber)}</p>
      ${kv("Fecha emision", formatChileDate(model.documentDate))}
      ${kv("Solicitud", model.id)}
      ${kv("Estado", model.statusLabel)}
    </div>
  </section>
  <div class="title"><h2>COMPROBANTE DE FERIADO</h2></div>
  <p class="intro">Correspondiente al Periodo Contractual: <strong>Del ${formatChileDate(model.contractPeriodStart ?? model.allocations[0]?.period)} Al ${formatChileDate(model.contractPeriodEnd)}</strong>. En cumplimiento a las disposiciones legales vigentes se deja constancia que el trabajador Don: <strong>${escapeHtml(model.employee.fullName)}</strong> hara uso de su feriado <strong>${model.vacationKind}</strong> con remuneracion integra de acuerdo al siguiente detalle:</p>
  <section class="box"><h3>Datos del trabajador</h3><div class="grid">
    ${kv("Nombre", model.employee.fullName)}
    ${kv("RUT", model.employee.rut)}
    ${kv("Cargo", model.employee.position)}
    ${kv("Area", model.employee.area)}
    ${kv("Centro costo", model.employee.costCenter)}
    ${kv("Ingreso", formatChileDate(model.employee.hireDate))}
    ${kv("Contrato", model.employee.contractType)}
  </div></section>
  <section class="box"><h3>Descanso efectivo entre las fechas que se indican</h3><div class="grid">
    ${kv("Desde el", formatChileDate(model.startDate))}
    ${kv("Al", formatChileDate(model.endDate))}
    ${kv("Reincorporacion", formatChileDate(model.reincorporationDate))}
    ${kv("Autorizo", model.approvedByName || "Pendiente")}
  </div></section>
  <section class="box"><h3>Detalle del feriado | Dias</h3>
    <table><tbody>
      <tr><th>Dias habiles</th><td>${formatDays(model.businessDays)}</td><th>Vac. progresivas</th><td>${formatDays(model.progressiveDays)}</td></tr>
      <tr><th>Domingos e inhabiles</th><td>${formatDays(model.nonBusinessDays)}</td><th>Feriado fraccionado</th><td>${escapeHtml(model.fractionalVacationLabel)}</td></tr>
      <tr><th>Saldo pendiente</th><td colspan="3">${formatDays(model.resultingBalance)}</td></tr>
    </tbody></table>
    <div class="balance"><div><span>Saldo anterior</span><strong>${formatDays(model.previousBalance)}</strong></div><div><span>Dias utilizados</span><strong>${formatDays(model.businessDays)}</strong></div><div><span>Saldo posterior</span><strong>${formatDays(model.resultingBalance)}</strong></div><div><span>Proporcional proyectado</span><strong>${formatDays(model.projectedProportional)}</strong></div></div>
  </section>
  <section class="box"><h3>Aplicacion por periodos</h3><table><thead><tr><th>Periodo</th><th>Saldo anterior</th><th>Dias utilizados</th><th>Saldo posterior</th></tr></thead><tbody>${allocationRows}</tbody></table></section>
  <div class="signatures"><div class="signature">Firma Empleador o Rep. Legal</div><div class="signature">Firma del trabajador</div></div>
  <p class="note"><strong>NOTA:</strong> ${escapeHtml(model.legalNote)}</p>
</main>
</body>
</html>`;
}

function pdfText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfLine(y: number, label: string, value: string | number | null | undefined) {
  return `0.15 0.11 0.10 rg BT /F1 9 Tf 52 ${y} Td (${pdfText(label)}: ${pdfText(String(value || "No informado"))}) Tj ET`;
}

export function renderVacationReceiptPdf(model: VacationReceiptModel) {
  const content = [
    "0.96 0.93 0.88 rg 40 706 532 96 re f",
    "0.43 0.09 0.16 rg BT /F2 18 Tf 52 778 Td (COMPROBANTE DE FERIADO) Tj ET",
    `0.43 0.09 0.16 rg BT /F2 12 Tf 390 778 Td (${pdfText(model.receiptNumber)}) Tj ET`,
    pdfLine(748, "Razon social", model.company.legalName),
    pdfLine(732, "RUT empresa", model.company.rut),
    pdfLine(716, "Fecha emision", formatChileDate(model.documentDate)),
    `0.15 0.11 0.10 rg BT /F1 10 Tf 52 676 Td (${pdfText(`Correspondiente al Periodo Contractual: Del ${formatChileDate(model.contractPeriodStart)} Al ${formatChileDate(model.contractPeriodEnd)}`)}) Tj ET`,
    `0.15 0.11 0.10 rg BT /F1 10 Tf 52 656 Td (${pdfText(`Don: ${model.employee.fullName} hara uso de su feriado ${model.vacationKind} con remuneracion integra.`)}) Tj ET`,
    "0.96 0.93 0.88 rg 40 540 532 90 re f",
    pdfLine(610, "Trabajador", model.employee.fullName),
    pdfLine(594, "RUT", model.employee.rut),
    pdfLine(578, "Cargo", model.employee.position),
    pdfLine(562, "Ingreso", formatChileDate(model.employee.hireDate)),
    "0.96 0.93 0.88 rg 40 418 532 90 re f",
    pdfLine(488, "Desde el", formatChileDate(model.startDate)),
    pdfLine(472, "Al", formatChileDate(model.endDate)),
    pdfLine(456, "Reincorporacion", formatChileDate(model.reincorporationDate)),
    pdfLine(440, "Dias habiles", formatDays(model.businessDays)),
    "0.96 0.93 0.88 rg 40 284 532 106 re f",
    pdfLine(368, "Vacaciones progresivas", formatDays(model.progressiveDays)),
    pdfLine(352, "Domingos e inhabiles", formatDays(model.nonBusinessDays)),
    pdfLine(336, "Feriado fraccionado", model.fractionalVacationLabel),
    pdfLine(320, "Saldo anterior", formatDays(model.previousBalance)),
    pdfLine(304, "Saldo posterior", formatDays(model.resultingBalance)),
    `0.40 0.33 0.30 rg BT /F1 8 Tf 52 254 Td (${pdfText(model.legalNote).slice(0, 120)}) Tj ET`,
    "0.65 0.56 0.50 RG 0.8 w 70 198 m 250 198 l S",
    "0.65 0.56 0.50 RG 0.8 w 360 198 m 540 198 l S",
    "0.15 0.11 0.10 rg BT /F1 9 Tf 105 180 Td (Firma trabajador) Tj ET",
    "0.15 0.11 0.10 rg BT /F1 9 Tf 384 180 Td (Firma empleador o Rep. Legal) Tj ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
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
