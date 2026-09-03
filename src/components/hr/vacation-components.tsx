"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}-${month}-${year}` : value;
}

function formatDays(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} dias` : "-";
}

export function VacationSummary({ employee, periods }: { employee: HrEmployee; periods: HrDashboardData["vacationPeriods"] }) {
  const available = periods.reduce((sum, period) => sum + period.availableBalance, 0);
  const reserved = periods.reduce((sum, period) => sum + period.reservedDays, 0);
  const advance = periods.reduce((sum, period) => sum + period.advanceDays, 0);
  const progressive = periods.reduce((sum, period) => sum + period.progressiveDays, 0);
  const current = periods.find((period) => period.status === "open") ?? periods[0] ?? null;
  const next = periods.find((period) => period.status === "future") ?? null;
  const currentBase = current?.baseDays ?? 15;
  const currentProgressive = current?.progressiveDays ?? 0;
  const projected = current ? ((currentBase + currentProgressive) / 12) : 0;
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Vacaciones disponibles</p>
      <p className="mt-1 text-3xl font-semibold text-brand-900">{available.toFixed(2)} dias</p>
      <p className="mt-1 text-xs text-[#667068]">Actualizado al {formatDate(today())}. Saldo operativo calculado desde periodos persistidos.</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <MiniMetric label="Saldo proporcional" value={periods.length ? `${projected.toFixed(6)} / mes` : "Requiere periodos"} />
        <MiniMetric label="Reservados" value={`${reserved.toFixed(2)} dias`} />
        <MiniMetric label="Anticipados" value={`${advance.toFixed(2)} dias`} />
        <MiniMetric label="Feriado base" value={`${currentBase.toFixed(2)} dias`} />
        <MiniMetric label="Feriado progresivo" value={`${currentProgressive.toFixed(2)} dias`} />
        <MiniMetric label="Total del periodo" value={`${(currentBase + currentProgressive).toFixed(2)} dias`} />
        <MiniMetric label="Progresivos historicos" value={`${progressive.toFixed(2)} dias`} />
        <MiniMetric label="Periodo vigente" value={current ? `${formatDate(current.periodStart)} / ${formatDate(current.periodEnd)}` : employee.hireDate ? "Backfill pendiente" : "Requiere ingreso"} />
        <MiniMetric label="Proxima anualidad" value={next ? formatDate(next.periodStart) : "No disponible"} />
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
          <tr><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Dias base</th><th className="px-4 py-3">Dias progresivos</th><th className="px-4 py-3">Total periodo</th><th className="px-4 py-3">Utilizados</th><th className="px-4 py-3">Reserv.</th><th className="px-4 py-3">Antic.</th><th className="px-4 py-3">Pendientes</th><th className="px-4 py-3">Estado</th></tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr className="border-t" key={period.id}>
              <td className="px-4 py-3">{period.periodStart} / {period.periodEnd}</td>
              <td className="px-4 py-3">{period.baseDays}</td>
              <td className="px-4 py-3">{period.progressiveDays}</td>
              <td className="px-4 py-3">{period.baseDays + period.progressiveDays}</td>
              <td className="px-4 py-3">{period.usedDays}</td>
              <td className="px-4 py-3">{period.reservedDays}</td>
              <td className="px-4 py-3">{period.advanceDays}</td>
              <td className="px-4 py-3 font-semibold">{period.availableBalance}</td>
              <td className="px-4 py-3">{period.status}</td>
            </tr>
          ))}
          {!periods.length ? <tr><td className="px-4 py-4 text-sm text-[#667068]" colSpan={9}>Sin periodos persistidos. Ejecuta backfill de vacaciones para crear las anualidades reales.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export function VacationProgressiveAudit({ employee, records, submitJson }: { employee: HrEmployee; records: HrDashboardData["vacationProgressiveRecords"]; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <div className="space-y-3">
      <form className="grid gap-3 rounded-md border border-[#dfe4dd] bg-white p-3 text-sm sm:grid-cols-2" onSubmit={(event) => submitJson(event, "/api/hr/vacations/progressive", "Anios previos reconocidos registrados.")}>
        <input name="employeeId" type="hidden" value={employee.id} />
        <label className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Anios previos reconocidos
          <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case tracking-normal" max="10" min="0" name="recognizedPreviousServiceYears" required step="1" type="number" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Fecha reconocimiento
          <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case tracking-normal" defaultValue={today()} name="accreditationDate" required type="date" />
        </label>
        <input className="rounded-md border px-3 py-2 text-sm" name="documentPath" placeholder="Documento respaldo, si existe" />
        <input className="rounded-md border px-3 py-2 text-sm" name="documentType" placeholder="Tipo documento" />
        <textarea className="rounded-md border px-3 py-2 text-sm sm:col-span-2" name="observation" placeholder="Observacion administrativa" rows={2} />
        <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 sm:col-span-2" type="submit">Registrar feriado progresivo</button>
      </form>
      <div className="space-y-2">
        {records.map((record) => (
          <div className="rounded-md border border-[#dfe4dd] bg-white p-3 text-sm" key={record.id}>
            <p className="font-semibold text-brand-900">{record.previousEmployerYears} anios previos reconocidos</p>
            <p className="text-xs text-[#667068]">Reconocido el {formatDate(record.accreditationDate)} / vigente desde {formatDate(record.effectiveFrom)} / estado {record.status}</p>
            {record.reviewNotes ? <p className="mt-1 text-xs text-[#667068]">{record.reviewNotes}</p> : null}
          </div>
        ))}
        {!records.length ? <p className="rounded-md border border-dashed border-[#dfe4dd] p-3 text-sm text-[#667068]">Sin anios previos reconocidos. No se calculan dias progresivos sin respaldo.</p> : null}
      </div>
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

type VacationPreviewState = {
  data: Record<string, unknown> | null;
  error: string | null;
  key: string | null;
  loading: boolean;
};

type VacationConfirmationState = {
  receiptPdfUrl?: string;
  receiptPreviewUrl?: string;
  receiptWarning?: string;
  requestId?: string;
};

function previewNumber(preview: Record<string, unknown> | null, key: string) {
  const value = preview?.[key];
  return typeof value === "number" ? value : null;
}

function previewAllocations(preview: Record<string, unknown> | null) {
  const value = preview?.allocations;
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function previewReviewReasons(preview: Record<string, unknown> | null) {
  const value = preview?.reviewReasons ?? preview?.blockingWarnings;
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function humanVacationReviewReason(reason: string) {
  const labels: Record<string, string> = {
    advance_exceeds_projected_proportional: "Los dias anticipados superan el proporcional proyectado.",
    advance_vacation_requires_explicit_authorization: "La solicitud requiere vacaciones anticipadas sin autorizacion explicita.",
    continuous_block_would_be_broken: "La solicitud no conserva el bloque continuo minimo protegido del periodo.",
    fractionation_agreement_required: "Esta solicitud corresponde a un feriado fraccionado. Para continuar debe registrarse el acuerdo entre trabajador y empleador.",
    holiday_calendar_incomplete: "El calendario de feriados esta incompleto para el rango solicitado.",
    holiday_calendar_missing: "Falta verificar el calendario de feriados para el rango solicitado.",
    insufficient_vacation_balance: "El saldo disponible no cubre los dias solicitados.",
    vacation_days_to_deduct_must_be_positive: "La solicitud no descuenta dias habiles legales.",
    vacation_overlap: "Existe una solicitud de vacaciones superpuesta.",
    vacation_overlap_check_failed: "No se pudo verificar si existen vacaciones superpuestas.",
    vacation_period_ambiguous: "Los periodos contractuales tienen solapamientos o ambiguedades."
  };
  return labels[reason] ?? reason;
}

function humanVacationPreviewMessage(result: Record<string, unknown> | null) {
  const message = typeof result?.message === "string" ? result.message : null;
  if (message) return message;
  const code = String(result?.code ?? result?.error ?? "");
  if (code === "INVALID_DATE_RANGE") return "La fecha Hasta no puede ser anterior a Desde.";
  if (code === "EMPLOYEE_HIRE_DATE_REQUIRED") return "No se puede calcular porque falta la fecha de ingreso del trabajador.";
  if (code === "EMPLOYEE_NOT_FOUND") return "No se encontro el trabajador seleccionado.";
  if (code === "VACATION_PREVIEW_VALIDATION_FAILED") return "Completa las fechas requeridas para calcular la vista previa.";
  return "No se pudo calcular la solicitud. Intenta nuevamente.";
}

function humanVacationConfirmMessage(result: Record<string, unknown> | null, status: number) {
  const code = String(result?.error ?? result?.code ?? "");
  if (status === 401 || code === "unauthorized") return "Tu sesion expiro. Vuelve a iniciar sesion antes de confirmar las vacaciones.";
  if (status === 403 || code === "hr_forbidden" || code === "forbidden") return "No tienes permisos para confirmar vacaciones.";
  if (code === "vacation_overlap" || code === "VACATION_CONFLICT") return "Existe una solicitud de vacaciones superpuesta. No se realizaron cambios.";
  if (code === "vacation_preview_invalid") return "La vista previa ya no es valida. Recalcula antes de confirmar.";
  if (code === "insufficient_vacation_balance" || code === "VACATION_BALANCE_CHANGED") return "El saldo disponible cambio o no cubre los dias solicitados. No se realizaron cambios.";
  if (code === "vacation_calendar_not_verified") return "Falta verificar el calendario de feriados antes de confirmar.";
  if (code === "VACATION_CREATE_FAILED") return "No se pudo crear la solicitud de vacaciones. No se realizaron cambios.";
  if (code === "VACATION_APPROVAL_FAILED") return "La solicitud se creo, pero no pudo aprobarse automaticamente. Revisa el historial antes de reintentar.";
  return "No se pudo confirmar la solicitud. No se realizaron cambios.";
}

export function VacationRequestForm({ employeeId, submitJson }: { employeeId: string; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  const [advanceAuthorized, setAdvanceAuthorized] = useState(false);
  const [confirmed, setConfirmed] = useState<VacationConfirmationState | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [fractionationAgreement, setFractionationAgreement] = useState(false);
  const [fractionalVacation, setFractionalVacation] = useState(false);
  const [manualHolidayDate, setManualHolidayDate] = useState("");
  const [manualHolidayReason, setManualHolidayReason] = useState("");
  const [note, setNote] = useState("");
  const [observation, setObservation] = useState("");
  const [preview, setPreview] = useState<VacationPreviewState>({ data: null, error: null, key: null, loading: false });
  const [startDate, setStartDate] = useState("");
  void submitJson;

  const payload = useMemo(() => ({
    advanceAuthorized,
    employeeId,
    endDate,
    fractionationAgreement,
    manualNonWorkingDays: manualHolidayDate ? [{ date: manualHolidayDate, reason: manualHolidayReason || "Cierre empresa manual" }] : [],
    startDate
  }), [advanceAuthorized, employeeId, endDate, fractionationAgreement, manualHolidayDate, manualHolidayReason, startDate]);

  const previewKey = useMemo(() => JSON.stringify(payload), [payload]);

  const previewVacation = useCallback(async () => {
    if (!startDate || !endDate) return;
    const payload = {
      advanceAuthorized,
      employeeId,
      endDate,
      fractionationAgreement,
      manualNonWorkingDays: manualHolidayDate ? [{ date: manualHolidayDate, reason: manualHolidayReason || "Cierre empresa manual" }] : [],
      startDate
    };
    const requestKey = JSON.stringify(payload);
    setPreview({ data: null, error: null, key: requestKey, loading: true });
    try {
      const response = await fetch("/api/hr/vacations/preview", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      const previewData = response.ok && result?.ok === true && typeof result.preview === "object" && result.preview !== null
        ? result.preview as Record<string, unknown>
        : null;
      setPreview({
        data: previewData,
        error: previewData ? null : humanVacationPreviewMessage(result),
        key: requestKey,
        loading: false
      });
    } catch {
      setPreview({ data: null, error: "No se pudo calcular la solicitud. Intenta nuevamente.", key: requestKey, loading: false });
    }
  }, [advanceAuthorized, employeeId, endDate, fractionationAgreement, manualHolidayDate, manualHolidayReason, startDate]);

  useEffect(() => {
    setPreview({ data: null, error: null, key: null, loading: Boolean(startDate && endDate) });
    if (!startDate || !endDate) {
      setPreview({ data: null, error: null, key: null, loading: false });
      return;
    }
    const timer = window.setTimeout(() => { void previewVacation(); }, 450);
    return () => window.clearTimeout(timer);
  }, [previewKey, previewVacation, startDate, endDate]);

  const previewIsCurrent = preview.key === previewKey;
  const previewCanConfirm = preview.data?.canConfirm === true || (preview.data?.canConfirm !== false && preview.data?.valid === true);
  const previewValidAndCurrent = previewIsCurrent && previewCanConfirm && !preview.error && !preview.loading;
  const previewBusinessDays = previewNumber(preview.data, "businessDays");
  const requiresFractionationAgreement = previewIsCurrent && previewReviewReasons(preview.data).includes("fractionation_agreement_required");
  const isFractionedPreview = typeof previewBusinessDays === "number" && previewBusinessDays > 0 && previewBusinessDays < 10;

  async function confirmVacation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirming) return;
    setConfirmError(null);
    if (!previewValidAndCurrent) {
      await previewVacation();
      return;
    }
    setConfirming(true);
    try {
      const response = await fetch("/api/hr/vacations", {
        body: JSON.stringify({
          ...payload,
          documentDate: today(),
          fractionalVacation: fractionalVacation || isFractionedPreview || fractionationAgreement,
          note,
          observation,
          status: "aprobada"
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        setConfirmError(humanVacationConfirmMessage(result, response.status));
        return;
      }
      setConfirmed({
        receiptPdfUrl: typeof result?.receiptPdfUrl === "string" ? result.receiptPdfUrl : undefined,
        receiptPreviewUrl: typeof result?.receiptPreviewUrl === "string" ? result.receiptPreviewUrl : undefined,
        receiptWarning: result?.receiptErrorCode === "VACATION_RECEIPT_FAILED" ? "La solicitud fue confirmada. El comprobante quedo pendiente de regeneracion." : undefined,
        requestId: typeof result?.requestId === "string" ? result.requestId : undefined
      });
    } catch {
      setConfirmError("No se pudo confirmar la solicitud. No se realizaron cambios.");
    } finally {
      setConfirming(false);
    }
  }

  const allocationRows = previewAllocations(preview.data);
  const reviewReasons = previewReviewReasons(preview.data);
  return (
    <form className="mt-4 space-y-4" onSubmit={confirmVacation}>
      <div>
        <h4 className="text-sm font-semibold text-brand-900">Solicitar vacaciones</h4>
        <p className="mt-1 text-xs text-[#667068]">El sistema calcula dias corridos, dias habiles legales, saldo y FIFO antes de confirmar.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Desde
          <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case tracking-normal" name="startDate" onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Hasta
          <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case tracking-normal" name="endDate" onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} />
        </label>
      </div>
      <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" disabled={!startDate || !endDate || preview.loading} onClick={() => void previewVacation()} type="button">
        {preview.loading ? "Calculando..." : "CALCULAR VACACIONES"}
      </button>
      <details className="rounded-md border border-[#dfe4dd] bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[#667068]">Opciones avanzadas</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold uppercase text-[#667068]">Agregar feriado / dia inhabil
            <input className="w-full rounded-md border px-3 py-2 text-sm font-normal normal-case" max={endDate || undefined} min={startDate || undefined} onChange={(event) => setManualHolidayDate(event.target.value)} type="date" value={manualHolidayDate} />
          </label>
          <input className="w-full rounded-md border px-3 py-2 text-sm" onChange={(event) => setManualHolidayReason(event.target.value)} placeholder="Motivo del dia inhabil" value={manualHolidayReason} />
          <label className="flex items-center gap-2 text-sm"><input checked={fractionalVacation || isFractionedPreview} onChange={(event) => setFractionalVacation(event.target.checked)} type="checkbox" /> Feriado fraccionado</label>
          <label className="flex items-center gap-2 text-sm"><input checked={fractionationAgreement} onChange={(event) => { setFractionationAgreement(event.target.checked); if (event.target.checked) setFractionalVacation(true); }} type="checkbox" /> Acuerdo de fraccionamiento</label>
          <label className="flex items-center gap-2 text-sm"><input checked={advanceAuthorized} onChange={(event) => setAdvanceAuthorized(event.target.checked)} type="checkbox" /> Autorizar anticipadas</label>
          <input className="w-full rounded-md border px-3 py-2 text-sm sm:col-span-2" onChange={(event) => setObservation(event.target.value)} placeholder="Observacion interna" value={observation} />
          <input className="w-full rounded-md border px-3 py-2 text-sm sm:col-span-2" onChange={(event) => setNote(event.target.value)} placeholder="Nota para comprobante" value={note} />
        </div>
      </details>
      {preview.error && previewIsCurrent ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{preview.error}</p> : null}
      {preview.data && previewIsCurrent ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Resumen de vacaciones</h4>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${previewCanConfirm ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{previewCanConfirm ? "LISTO PARA CONFIRMAR" : requiresFractionationAgreement ? "REQUIERE ACUERDO DE FRACCIONAMIENTO" : "REVISAR"}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Desde" value={formatDate(startDate)} />
            <MiniMetric label="Hasta" value={formatDate(endDate)} />
            <MiniMetric label="Dias corridos" value={String(previewNumber(preview.data, "calendarDays") ?? "-")} />
            <MiniMetric label="Dias habiles" value={String(previewNumber(preview.data, "businessDays") ?? "-")} />
            <MiniMetric label="Sabados" value={String(Number((preview.data.nonBusiness as Record<string, unknown> | undefined)?.saturdays ?? 0))} />
            <MiniMetric label="Domingos" value={String(Number((preview.data.nonBusiness as Record<string, unknown> | undefined)?.sundays ?? 0))} />
            <MiniMetric label="Feriados" value={String(Number((preview.data.nonBusiness as Record<string, unknown> | undefined)?.legalHolidays ?? 0))} />
            <MiniMetric label="Otros inhabiles" value={String(Number((preview.data.nonBusiness as Record<string, unknown> | undefined)?.manualNonWorkingDays ?? 0))} />
            <MiniMetric label="Progresivas disponibles" value={String(Math.max(0, (previewNumber(preview.data, "annualEntitlement") ?? 15) - 15))} />
            <MiniMetric label="Saldo antes" value={formatDays(previewNumber(preview.data, "totalAvailable"))} />
            <MiniMetric label="Dias a descontar" value={formatDays(previewNumber(preview.data, "businessDays"))} />
            <MiniMetric label="Saldo despues" value={formatDays(previewNumber(preview.data, "totalAfterRequest"))} />
          </div>
          {preview.data.scheduleReviewRequired ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No hay politica empresa ni override individual valido para calcular esta solicitud.</p> : null}
          {requiresFractionationAgreement ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">FERIADO FRACCIONADO</p>
              <p className="mt-1">Esta solicitud corresponde a {formatDays(previewBusinessDays)} dias habiles. Para continuar debe existir acuerdo de fraccionamiento entre empleador y trabajador.</p>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input checked={fractionationAgreement} onChange={(event) => { setFractionationAgreement(event.target.checked); if (event.target.checked) setFractionalVacation(true); }} type="checkbox" />
                REGISTRAR ACUERDO DE FRACCIONAMIENTO
              </label>
            </div>
          ) : null}
          {!previewCanConfirm ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Motivo:</p>
              {reviewReasons.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {reviewReasons.map((reason) => <li key={reason}>{humanVacationReviewReason(reason)}</li>)}
                </ul>
              ) : <p className="mt-1">No se recibio una causa concreta de revision.</p>}
            </div>
          ) : null}
          {allocationRows.length ? (
            <div className="mt-3 rounded-md border border-[#dfe4dd] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Periodo(s) contractual(es) utilizado(s)</p>
              <div className="mt-2 space-y-1">
                {allocationRows.map((allocation, index) => (
                  <p className="text-xs text-[#4e5a52]" key={`${String(allocation.periodId ?? index)}`}>
                    Periodo {index + 1}: {formatDate(String(allocation.periodStart ?? ""))} {"->"} {formatDate(String(allocation.periodEnd ?? ""))} / {String(allocation.days ?? "-")} dias
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {confirmed ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">VACACIONES REGISTRADAS</p>
          <p className="mt-1 text-xs">Solicitud {confirmed.requestId}. {confirmed.receiptWarning ?? "El comprobante fue generado y asociado al trabajador."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {confirmed.receiptPdfUrl ? <a className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" href={confirmed.receiptPdfUrl} rel="noreferrer" target="_blank">DESCARGAR COMPROBANTE</a> : null}
            {confirmed.receiptPreviewUrl ? <a className="rounded-md border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800" href={confirmed.receiptPreviewUrl} rel="noreferrer" target="_blank">VER COMPROBANTE</a> : null}
          </div>
        </div>
      ) : null}
      {confirmError ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{confirmError}</p> : null}
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!previewValidAndCurrent || confirming || Boolean(confirmed)} type="submit">{confirming ? "CONFIRMANDO..." : "CONFIRMAR VACACIONES"}</button>
    </form>
  );
}

function simpleVacationStatus(vacation: HrDashboardData["vacations"][number]) {
  if (vacation.status === "anulada" || vacation.status === "rechazada") return "CANCELADA";
  if (vacation.status === "borrador") return "BORRADOR";
  if (vacation.status !== "aprobada") return "PROGRAMADA";
  const current = today();
  if (current < vacation.startDate) return "PROGRAMADA";
  if (current <= (vacation.effectiveRestEndDate ?? vacation.endDate)) return "EN CURSO";
  return "COMPLETADA";
}

export function VacationRecentRequests({ vacations }: { vacations: HrDashboardData["vacations"] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-[#dfe4dd] bg-white">
      <div className="border-b border-[#dfe4dd] px-4 py-3">
        <p className="text-sm font-semibold text-brand-900">Vacaciones recientes</p>
      </div>
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase text-[#667068]">
          <tr><th className="px-4 py-3">Desde</th><th className="px-4 py-3">Hasta</th><th className="px-4 py-3">Dias</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Saldo posterior</th><th className="px-4 py-3">Comprobante</th></tr>
        </thead>
        <tbody>
          {vacations.slice(0, 8).map((vacation) => (
            <tr className="border-t" key={vacation.id}>
              <td className="px-4 py-3">{formatDate(vacation.startDate)}</td>
              <td className="px-4 py-3">{formatDate(vacation.effectiveRestEndDate ?? vacation.endDate)}</td>
              <td className="px-4 py-3">{vacation.businessDays}</td>
              <td className="px-4 py-3">{vacation.documentNumber ?? "FIFO"}</td>
              <td className="px-4 py-3">{simpleVacationStatus(vacation)}</td>
              <td className="px-4 py-3">{vacation.resultingBalance.toFixed(2)}</td>
              <td className="px-4 py-3">{vacation.documentNumber ? <a className="font-semibold text-brand-700" href={`/api/hr/vacations/${vacation.id}/papeleta?format=pdf`} rel="noreferrer" target="_blank">PDF</a> : "Pendiente"}</td>
            </tr>
          ))}
          {!vacations.length ? <tr><td className="px-4 py-4 text-sm text-[#667068]" colSpan={7}>Sin vacaciones programadas.</td></tr> : null}
        </tbody>
      </table>
    </div>
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
