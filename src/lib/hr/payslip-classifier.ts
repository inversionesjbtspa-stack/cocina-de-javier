import crypto from "node:crypto";
import { extractPayslipsFromPdf } from "./payroll-parser.ts";
import { normalizeRut } from "./utils.ts";

export type PayslipMatchEmployee = {
  fullName: string;
  id: string;
  rut: string;
};

export type PayslipClassification = {
  detectedName: string;
  detectedPeriod: string;
  detectedRut: string;
  employeeId: string | null;
  employeeName: string;
  fileSha256: string;
  matchLevel: "alta" | "media" | "revision";
  matchMethod: "rut_exacto" | "nombre_unico" | "revision_manual";
  netAmount: number;
  reviewReason: string;
  status: "auto_asociada" | "requiere_revision";
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

function rutFromText(text: string) {
  const match = text.match(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/);
  return match ? normalizeRut(match[0]) : "";
}

function loosePdfText(buffer: Buffer) {
  return buffer.toString("latin1").replace(/[^\x20-\x7EÁÉÍÓÚÑáéíóúñ.-]/g, " ");
}

function bestNameMatch(name: string, employees: PayslipMatchEmployee[]) {
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

export function classifyPayslipPdf(buffer: Buffer, employees: PayslipMatchEmployee[], fallbackPeriod: string): PayslipClassification {
  const sha = crypto.createHash("sha256").update(buffer).digest("hex");
  const parsed = extractPayslipsFromPdf(buffer)[0] ?? null;
  const rawText = parsed?.rawText || loosePdfText(buffer);
  const detectedRut = normalizeRut(parsed?.rut || rutFromText(rawText));
  const detectedName = parsed?.fullName || "";
  const detectedPeriod = parsed?.period || fallbackPeriod;
  const netAmount = parsed?.netPay ?? 0;

  if (!rawText.trim() || (!detectedRut && !detectedName)) {
    return {
      detectedName,
      detectedPeriod,
      detectedRut,
      employeeId: null,
      employeeName: "Sin asignar",
      fileSha256: sha,
      matchLevel: "revision",
      matchMethod: "revision_manual",
      netAmount,
      reviewReason: "PDF sin texto util o sin RUT detectable",
      status: "requiere_revision"
    };
  }

  const rutMatch = detectedRut ? employees.find((employee) => normalizeRut(employee.rut) === detectedRut) : null;
  if (rutMatch) {
    return {
      detectedName: detectedName || rutMatch.fullName,
      detectedPeriod,
      detectedRut,
      employeeId: rutMatch.id,
      employeeName: rutMatch.fullName,
      fileSha256: sha,
      matchLevel: "alta",
      matchMethod: "rut_exacto",
      netAmount,
      reviewReason: "",
      status: "auto_asociada"
    };
  }

  const nameMatch = detectedName ? bestNameMatch(detectedName, employees) : null;
  if (nameMatch) {
    return {
      detectedName,
      detectedPeriod,
      detectedRut,
      employeeId: nameMatch.id,
      employeeName: nameMatch.fullName,
      fileSha256: sha,
      matchLevel: "media",
      matchMethod: "nombre_unico",
      netAmount,
      reviewReason: "",
      status: "auto_asociada"
    };
  }

  return {
    detectedName,
    detectedPeriod,
    detectedRut,
    employeeId: null,
    employeeName: "Sin asignar",
    fileSha256: sha,
    matchLevel: "revision",
    matchMethod: "revision_manual",
    netAmount,
    reviewReason: detectedRut ? "RUT no coincide con trabajador activo" : "Coincidencia por nombre ausente o ambigua",
    status: "requiere_revision"
  };
}
