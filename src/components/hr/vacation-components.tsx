"use client";

import { useState, type FormEvent } from "react";
import type { HrDashboardData, HrEmployee } from "@/lib/hr/data";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthToday() {
  return new Date().toISOString().slice(0, 7);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfe4dd] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667068]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-brand-900">{value}</p>
    </div>
  );
}

export function VacationSummary({ employee, periods }: { employee: HrEmployee; periods: HrDashboardData["vacationPeriods"] }) {
  const available = periods.reduce((sum, period) => sum + period.availableBalance, 0);
  const reserved = periods.reduce((sum, period) => sum + period.reservedDays, 0);
  const advance = periods.reduce((sum, period) => sum + period.advanceDays, 0);
  const progressive = periods.reduce((sum, period) => sum + period.progressiveDays, 0);
  const projected = periods[0] ? ((periods[0].baseDays + periods[0].progressiveDays) / 12) : 0;
  const current = periods.find((period) => period.status === "open") ?? periods[0] ?? null;
  return (
    <div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <MiniMetric label="Disponible" value={`${available.toFixed(2)} dias`} />
        <MiniMetric label="Proporcional" value={periods.length ? `${projected.toFixed(6)} / mes` : "Requiere periodos"} />
        <MiniMetric label="Reservados" value={`${reserved.toFixed(2)} dias`} />
        <MiniMetric label="Anticipados" value={`${advance.toFixed(2)} dias`} />
        <MiniMetric label="Progresivos" value={`${progressive.toFixed(2)} dias`} />
        <MiniMetric label="Anualidad" value={current ? `${current.periodStart} / ${current.periodEnd}` : employee.hireDate ? "Backfill pendiente" : "Requiere ingreso"} />
      </div>
      <p className="mt-3 text-xs text-[#667068]">El saldo operativo usa periodos persistidos. El proporcional proyectado no se suma salvo autorizacion explicita de vacaciones anticipadas.</p>
    </div>
  );
}

export function VacationPeriodsTable({ periods }: { periods: HrDashboardData["vacationPeriods"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase text-[#667068]">
          <tr><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Base</th><th className="px-4 py-3">Prog.</th><th className="px-4 py-3">Usados</th><th className="px-4 py-3">Reserv.</th><th className="px-4 py-3">Antic.</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Estado</th></tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr className="border-t" key={period.id}>
              <td className="px-4 py-3">{period.periodStart} / {period.periodEnd}</td>
              <td className="px-4 py-3">{period.baseDays}</td>
              <td className="px-4 py-3">{period.progressiveDays}</td>
              <td className="px-4 py-3">{period.usedDays}</td>
              <td className="px-4 py-3">{period.reservedDays}</td>
              <td className="px-4 py-3">{period.advanceDays}</td>
              <td className="px-4 py-3 font-semibold">{period.availableBalance}</td>
              <td className="px-4 py-3">{period.status}</td>
            </tr>
          ))}
          {!periods.length ? <tr><td className="px-4 py-4 text-sm text-[#667068]" colSpan={8}>Sin periodos persistidos. Ejecuta backfill de vacaciones para crear las anualidades reales.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export function VacationMovements({ movements }: { movements: HrDashboardData["vacationMovements"] }) {
  return (
    <div className="space-y-2">
      {movements.slice(0, 8).map((movement) => (
        <div className="rounded-md border border-[#dfe4dd] bg-white p-3 text-sm" key={movement.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-brand-900">{movement.movementType}</p>
            <span className="text-xs text-[#667068]">{movement.effectiveDate ?? movement.createdAt.slice(0, 10)}</span>
          </div>
          <p className="mt-1 text-xs text-[#667068]">{movement.days} dias / saldo {movement.previousBalance} {"->"} {movement.resultingBalance} / origen {movement.source ?? "sistema"}</p>
          {movement.notes ? <p className="mt-1 text-xs text-[#667068]">{movement.notes}</p> : null}
        </div>
      ))}
      {!movements.length ? <p className="rounded-md border border-dashed border-[#dfe4dd] p-4 text-sm text-[#667068]">Sin movimientos persistidos para este trabajador.</p> : null}
    </div>
  );
}

export function VacationRequestForm({ employeeId, submitJson }: { employeeId: string; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  async function previewVacation(form: HTMLFormElement) {
    const formData = new FormData(form);
    const payload = {
      advanceAuthorized: formData.get("advanceAuthorized") === "on",
      employeeId,
      endDate: String(formData.get("endDate") ?? ""),
      fractionationAgreement: formData.get("fractionationAgreement") === "on",
      requestedBusinessDays: formData.get("requestedBusinessDays") ? Number(formData.get("requestedBusinessDays")) : undefined,
      startDate: String(formData.get("startDate") ?? "")
    };
    const response = await fetch("/api/hr/vacations/preview", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = await response.json().catch(() => null);
    setPreview(result?.preview ?? { error: result?.error ?? "preview_failed" });
  }
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations", "Vacaciones registradas.")}>
      <input name="employeeId" type="hidden" value={employeeId} />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="documentDate" type="date" defaultValue={today()} />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="startDate" type="date" required />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="requestedBusinessDays" placeholder="Dias habiles solicitados" type="number" step="0.01" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="endDate" type="date" />
      </div>
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="borrador">Borrador</option><option value="solicitada">Solicitada</option><option value="pendiente">Pendiente</option><option value="aprobada">Aprobar y generar comprobante</option><option value="rechazada">Rechazada</option></select>
      <label className="flex items-center gap-2 text-sm"><input name="fractionalVacation" type="checkbox" /> Feriado fraccionado</label>
      <label className="flex items-center gap-2 text-sm"><input name="fractionationAgreement" type="checkbox" /> Existe acuerdo de fraccionamiento</label>
      <label className="flex items-center gap-2 text-sm"><input name="advanceAuthorized" type="checkbox" /> Autorizar vacaciones anticipadas</label>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="observation" placeholder="Observacion" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="note" placeholder="Nota comprobante" />
      {preview ? (
        <div className="rounded-md border border-brand-100 bg-brand-50 p-3 text-xs text-brand-900">
          {"error" in preview ? <p>Vista previa no disponible: {String(preview.error)}</p> : (
            <div className="grid gap-1 sm:grid-cols-2">
              <p>Dias habiles: {String(preview.businessDays ?? "-")}</p>
              <p>Ultimo dia computado: {String(preview.lastCountedVacationDate ?? "-")}</p>
              <p>Fin descanso: {String(preview.effectiveRestEndDate ?? "-")}</p>
              <p>Reincorporacion: {String(preview.returnToWorkDate ?? "-")}</p>
              <p>Proporcional: {Number(preview.projectedProportional ?? 0).toFixed(6)}</p>
              <p>Anticipo: {String(preview.advanceDays ?? 0)} dias</p>
              <p>FIFO: {Array.isArray(preview.allocations) ? preview.allocations.length : 0} periodos</p>
              <p>Valido: {preview.valid ? "SI" : "NO"}</p>
            </div>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" onClick={(event) => previewVacation(event.currentTarget.form as HTMLFormElement)} type="button">Vista previa</button>
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Guardar solicitud</button>
      </div>
    </form>
  );
}

export function VacationAccrualForm({ employeeId, submitJson }: { employeeId: string; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <form className="mt-4 border-t border-[#dfe4dd] pt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations/accruals", "Movimiento de vacaciones registrado.")}>
      <input name="employeeId" type="hidden" value={employeeId} />
      <p className="text-sm font-semibold text-brand-900">Acumulacion / ajuste legacy</p>
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={monthToday()} name="period" type="month" />
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="movementType"><option value="acumulacion_mensual">Acumulacion mensual</option><option value="saldo_inicial">Saldo inicial</option><option value="ajuste_manual">Ajuste manual</option><option value="vacaciones_tomadas">Vacaciones tomadas</option><option value="finiquito">Finiquito</option></select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="days" placeholder="Dias (+/-)" type="number" step="0.01" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="note" placeholder="Motivo auditoria" />
      <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" type="submit">Guardar movimiento</button>
    </form>
  );
}

export function VacationImportPreview({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-[980px] w-full text-left text-xs">
        <thead className="bg-brand-50 uppercase text-[#667068]">
          <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Trabajador</th><th className="px-3 py-2">RUT</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Periodo</th><th className="px-3 py-2">Dias</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Obs.</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-t" key={`${String(row.rowHash ?? index)}`}>
              <td className="px-3 py-2">{String(row.rowNumber ?? index + 1)}</td>
              <td className="px-3 py-2 font-semibold text-brand-900">{String(row.employeeName || "Sin asociar")}</td>
              <td className="px-3 py-2">{String(row.rut ?? "-")}</td>
              <td className="px-3 py-2">{String(row.importType ?? "-")}</td>
              <td className="px-3 py-2">{String(row.effectiveDate ?? "-")}</td>
              <td className="px-3 py-2">{row.periodStart ? `${String(row.periodStart)} / ${String(row.periodEnd)}` : "-"}</td>
              <td className="px-3 py-2">{String(row.days ?? "-")}</td>
              <td className="px-3 py-2">{String(row.status ?? "-")}</td>
              <td className="px-3 py-2">{String(row.notes ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
