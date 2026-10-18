export const LEGACY_VACATION_REVIEW_MESSAGE = "Esta solicitud pertenece al historial anterior al saldo certificado y no puede revertirse automáticamente porque alteraría un período ya absorbido. Puede gestionarse mediante anulación administrativa sin afectar el saldo actual.";

type HistoryOpening = { id: string; effectiveCutoffDate: string; absorbedRequestIds?: readonly string[] };
type HistoryRequest = {
  id: string; startDate: string; endDate: string; openingBalanceId?: string | null;
  administrativeCancellation?: { cancelledAt: string; reason: string } | null;
};

export function isAbsorbedVacationRequest(request: HistoryRequest, opening: HistoryOpening | undefined, asOf: string) {
  return Boolean(opening && opening.effectiveCutoffDate <= asOf && request.endDate <= opening.effectiveCutoffDate
    && opening.absorbedRequestIds?.includes(request.id) && request.openingBalanceId !== opening.id);
}

export function vacationCancellationMode(request: HistoryRequest, opening: HistoryOpening | undefined, asOf: string) {
  if (request.administrativeCancellation) return "administratively_cancelled";
  if (isAbsorbedVacationRequest(request, opening, asOf)) return "administrative";
  if (opening && opening.effectiveCutoffDate <= asOf && request.openingBalanceId !== opening.id) return "historical_review";
  return "economic";
}

export function vacationActionMessage(error: string | null | undefined) {
  if (error === "legacy_vacation_requires_cutoff_review" || error === "vacation_not_absorbed_history") return LEGACY_VACATION_REVIEW_MESSAGE;
  if (error === "hr_forbidden" || error === "forbidden") return "No tienes permisos para realizar esta gestión de RRHH.";
  if (error === "unauthorized") return "Tu sesión ha vencido. Inicia sesión nuevamente antes de continuar.";
  return error || "No se pudo completar la acción. No se han confirmado cambios.";
}

export type VacationHistoryMovement = {
  id: string; requestId?: string | null; effectiveDate: string | null;
  requestStartDate?: string | null; requestEndDate?: string | null;
  periodEarnedOn?: string | null; periodOpeningBalanceId?: string | null;
};

// Absorption takes precedence over late registration or a misleading effective date.
export function classifyVacationMovement(movement: VacationHistoryMovement, opening: HistoryOpening) {
  if (movement.requestId && opening.absorbedRequestIds?.includes(movement.requestId)) return "absorbed";
  const date = movement.effectiveDate ?? movement.requestStartDate ?? movement.periodEarnedOn;
  if (movement.periodOpeningBalanceId === opening.id) return "operational";
  if (date && date > opening.effectiveCutoffDate) return "operational";
  if (date && date <= opening.effectiveCutoffDate) return "historical";
  return "review";
}
