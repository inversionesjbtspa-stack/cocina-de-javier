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

export type SalaryColumnDefinition = {
  automatic: boolean;
  column: string;
  editable: boolean;
  field: SalaryExportColumnKey | null;
  header: string;
  optional: boolean;
  origin: "worker" | "manual" | "automatic" | "template";
  type: "text" | "number";
};

export const SALARY_COLUMN_DEFINITIONS: SalaryColumnDefinition[] = [
  { automatic: true, column: "A", editable: false, field: "fullName", header: "NOMBRE", optional: false, origin: "worker", type: "text" },
  { automatic: true, column: "B", editable: false, field: "rut", header: "RUT", optional: false, origin: "worker", type: "text" },
  { automatic: true, column: "C", editable: true, field: "costCenter", header: "C. COSTO", optional: true, origin: "worker", type: "text" },
  { automatic: false, column: "D", editable: true, field: "absences", header: "INASISTENCIAS", optional: true, origin: "manual", type: "number" },
  { automatic: false, column: "E", editable: true, field: "reason", header: "MOTIVO", optional: true, origin: "manual", type: "text" },
  { automatic: false, column: "F", editable: true, field: "overtimeHours", header: "HORAS EXTRAS", optional: true, origin: "manual", type: "number" },
  { automatic: false, column: "G", editable: false, field: null, header: "AGUINALDO", optional: true, origin: "template", type: "number" },
  { automatic: false, column: "H", editable: false, field: null, header: "AGUINALDO", optional: true, origin: "template", type: "number" },
  { automatic: true, column: "I", editable: false, field: "productionBonus", header: "BONO PRODUCCION", optional: true, origin: "automatic", type: "number" },
  { automatic: false, column: "J", editable: false, field: null, header: "BONO  COMP,", optional: true, origin: "template", type: "number" },
  { automatic: true, column: "K", editable: true, field: "compensatoryBonus", header: "BONO  COMP,", optional: true, origin: "automatic", type: "number" },
  { automatic: true, column: "L", editable: true, field: "sundaySurcharge", header: "RECARGO DOMINGO", optional: true, origin: "automatic", type: "number" },
  { automatic: true, column: "M", editable: false, field: "responsibilityBonus", header: "BONO RESPONSABILIDAD", optional: true, origin: "automatic", type: "number" },
  { automatic: false, column: "N", editable: true, field: "movilization", header: "MOVILIZACION", optional: true, origin: "manual", type: "number" },
  { automatic: false, column: "O", editable: true, field: "phoneAllowance", header: "ASIG. TELEFONO", optional: true, origin: "manual", type: "number" },
  { automatic: false, column: "P", editable: true, field: "cashAllowance", header: "CAJA", optional: true, origin: "manual", type: "number" },
  { automatic: true, column: "Q", editable: false, field: "advances", header: "ANTICIPOS", optional: true, origin: "automatic", type: "number" },
  { automatic: false, column: "R", editable: false, field: null, header: "ANTICIPO AGUINALDO", optional: true, origin: "template", type: "number" },
  { automatic: true, column: "S", editable: true, field: "companyLoan", header: "PTMO EMPRESA", optional: true, origin: "automatic", type: "number" },
  { automatic: true, column: "T", editable: true, field: "ccafLoan", header: "PRESTAMO CAJA", optional: true, origin: "automatic", type: "number" },
  { automatic: true, column: "U", editable: false, field: "aguinaldo", header: "AGUINALDO", optional: true, origin: "automatic", type: "number" },
  { automatic: true, column: "V", editable: false, field: "advanceAguinaldo", header: "ANTICIPO AGUINALDO", optional: true, origin: "automatic", type: "number" }
] as const;
