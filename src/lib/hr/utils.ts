export function normalizeRut(value: string) {
  return value.replace(/[.\s]/g, "").toUpperCase();
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function businessDaysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) {
    return 0;
  }

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function accruedVacationDays(hireDate: string | null | undefined, asOf = new Date()) {
  if (!hireDate) return 0;
  const start = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(start.valueOf()) || start > asOf) return 0;
  const elapsedDays = Math.floor((asOf.getTime() - start.getTime()) / 86400000);
  return Math.round((elapsedDays * (15 / 365)) * 100) / 100;
}

export function paymentReady(alerts: string[]) {
  return alerts.length === 0;
}
