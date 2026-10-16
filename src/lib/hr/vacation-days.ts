export function parseVacationDays(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value * 10000 - Math.round(value * 10000)) < 0.000001 ? value : null;
  const clean = String(value ?? "").trim();
  if (!/^[+-]?\d+(?:[.,]\d{1,4})?$/.test(clean)) return null;
  const parsed = Number(clean.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
