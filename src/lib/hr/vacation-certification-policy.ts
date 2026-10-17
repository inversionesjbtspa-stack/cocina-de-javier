export const VACATION_CERTIFICATION_REQUIRED_FROM = "2026-10-16";
export const VACATION_CERTIFICATION_REQUIRED_CODE = "VACATION_CERTIFIED_BALANCE_REQUIRED";
export const VACATION_CERTIFICATION_REQUIRED_REASON = "certified_vacation_balance_required";
export const VACATION_CERTIFICATION_REQUIRED_MESSAGE = "Este trabajador no tiene saldo certificado de vacaciones. Requiere revisión antes de confirmar.";

export function vacationCertificationBlock(asOf: string, hasActiveCertificate: boolean) {
  if (asOf < VACATION_CERTIFICATION_REQUIRED_FROM || hasActiveCertificate) return null;
  return {
    code: VACATION_CERTIFICATION_REQUIRED_CODE,
    message: VACATION_CERTIFICATION_REQUIRED_MESSAGE,
    status: "REQUIERE SALDO CERTIFICADO",
    canConfirm: false,
    requiresReview: true,
    reviewReasons: [VACATION_CERTIFICATION_REQUIRED_REASON],
    blockingWarnings: [VACATION_CERTIFICATION_REQUIRED_REASON]
  } as const;
}

export function uncertifiedVacationPreview(block: NonNullable<ReturnType<typeof vacationCertificationBlock>>) {
  return {
    ok: true,
    ...block,
    balanceBefore: null,
    balanceAfter: null,
    periodsPersisted: false,
    allocations: [],
    preview: { ...block, valid: false, totalAvailable: null, totalAfterRequest: null, allocations: [] }
  };
}
