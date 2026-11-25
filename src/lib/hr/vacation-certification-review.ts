type EmployeeIdentity = { id: string; fullName: string; rut: string };
export type VacationIdentityAntecedent = { employeeId: string | null; fullName: string; rut: string };

function nameKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

function rutKey(value: string) {
  return value.replace(/[^\dKk]/g, "").toUpperCase();
}

// A nominal collision flags review only. It never links a source balance or certifies an identity.
export function vacationCertificationReviewAlert(employee: EmployeeIdentity, antecedents: VacationIdentityAntecedent[]) {
  const conflicting = antecedents.some(source => {
    const sameIdentityReference = source.employeeId === employee.id
      || (!source.employeeId && nameKey(source.fullName) === nameKey(employee.fullName));
    return sameIdentityReference && rutKey(source.rut) && rutKey(source.rut) !== rutKey(employee.rut);
  });
  return conflicting ? "REQUIERE SALDO CERTIFICADO - CONFLICTO DE RUT" : "REQUIERE SALDO CERTIFICADO";
}
