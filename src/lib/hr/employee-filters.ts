export type HrEmployeeIdentity = {
  fullName?: string | null;
  rut?: string | null;
};

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function isTechnicalValidationEmployee(employee: HrEmployeeIdentity | null | undefined) {
  const fullName = normalizeIdentity(employee?.fullName);
  return fullName.includes("CODEX VALIDACION RRHH") || fullName.includes("CODEX VALIDACION");
}

export function isProductiveHrEmployee<T extends HrEmployeeIdentity>(employee: T) {
  return !isTechnicalValidationEmployee(employee);
}
