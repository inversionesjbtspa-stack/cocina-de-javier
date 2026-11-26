import { normalizeRut } from "./utils.ts";

type Employee = { id: string; tenantId: string; rut: string; status: string; hireDate: string | null };
type ApprovedSource = { workerId: string; tenantId: string; canonicalRut: string; sourceRut: string;
  balanceDays: number; sourceFile: string; sourceHash: string; sourceRow: number; cutoffDate: string;
  approvalReference: string; resolutionReason: string };

// Prepare metadata for the existing authenticated import RPC; never writes or matches by name.
export function prepareAdministrativeVacationOpening(employee: Employee, source: ApprovedSource) {
  if (employee.id !== source.workerId || employee.tenantId !== source.tenantId
    || normalizeRut(employee.rut) !== normalizeRut(source.canonicalRut)) throw new Error("approved_vacation_identity_mismatch");
  if (employee.status !== "activo" || !employee.hireDate) throw new Error("approved_vacation_employee_invalid");
  for (const date of [employee.hireDate, source.cutoffDate]) {
    const parsed = new Date(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("approved_vacation_date_invalid");
  }
  if (employee.hireDate > source.cutoffDate) throw new Error("approved_vacation_date_invalid");
  if (!source.approvalReference.trim() || !source.resolutionReason.trim() || !source.sourceFile.trim()
    || !/^[a-f0-9]{64}$/.test(source.sourceHash) || !Number.isInteger(source.sourceRow) || source.sourceRow < 1
    || !/^\d{7,8}-[\dK]$/.test(normalizeRut(source.sourceRut))
    || !Number.isFinite(source.balanceDays) || Math.round(source.balanceDays * 10000) / 10000 !== source.balanceDays) {
    throw new Error("approved_vacation_source_invalid");
  }
  return {
    rut: normalizeRut(employee.rut).replace("-", ""), worker_id: employee.id, resolved_worker_id: employee.id,
    canonical_rut: source.canonicalRut, canonical_rut_normalized: normalizeRut(employee.rut),
    source_rut: source.sourceRut, source_rut_normalized: normalizeRut(source.sourceRut),
    source_rut_original: source.sourceRut, source_file: source.sourceFile, source_balance: source.balanceDays,
    source_row: source.sourceRow, balance_days: source.balanceDays, effective_cutoff_date: source.cutoffDate,
    resolution_reason: source.resolutionReason, approval_reference: source.approvalReference,
    progressive_days_current: 0, recognized_previous_years: null, annual_entitlement_override: null,
    override_reason: null, internal_alert: null
  };
}
