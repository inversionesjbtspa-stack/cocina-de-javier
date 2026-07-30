export const SALARY_TEMPLATE = {
  headerRow: 5,
  firstWorkerRow: 6,
  mainSheetName: "LIBRO REMUNERACIONES",
  outputPrefix: "Datos sueldos",
  templatePath: ["src", "templates", "rrhh", "datos-sueldos-contador.xlsx"]
} as const;

export const SALARY_EXPORT_COLUMNS = {
  fullName: "A",
  rut: "B",
  costCenter: "C",
  absences: "D",
  reason: "E",
  overtimeHours: "F",
  productionBonus: "I",
  compensatoryBonus: "K",
  sundaySurcharge: "L",
  responsibilityBonus: "M",
  movilization: "N",
  phoneAllowance: "O",
  cashAllowance: "P",
  advances: "Q",
  companyLoan: "S",
  ccafLoan: "T",
  aguinaldo: "U",
  advanceAguinaldo: "V"
} as const;

export const SALARY_HIDDEN_COLUMNS = ["G", "H", "R"] as const;

export const SALARY_PRESERVED_SHEETS = [
  "LIBRO REMUNERACIONES",
  "Bono produccion",
  "RetencionCredito CAJA",
  "asignacion familiar febrero 23"
] as const;

export type SalaryExportColumnKey = keyof typeof SALARY_EXPORT_COLUMNS;
