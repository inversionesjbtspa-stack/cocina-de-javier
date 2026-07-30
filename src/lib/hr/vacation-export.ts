import type { VacationAllocation, VacationPeriod } from "./vacation-domain.ts";

export type VacationExportEmployee = {
  area?: string | null;
  costCenter?: string | null;
  fullName: string;
  hireDate?: string | null;
  id: string;
  position?: string | null;
  rut: string;
  status?: string | null;
};

export type VacationExportRequest = {
  businessDays: number;
  documentNumber?: string | null;
  employeeId: string;
  endDate: string;
  id: string;
  resultingBalance: number;
  startDate: string;
  status: string;
};

export type VacationExportMovement = {
  balanceAfter: number;
  days: number;
  employeeId: string;
  movementType: string;
  period: string;
};

export type VacationExportData = {
  allocations?: VacationAllocation[];
  employees: VacationExportEmployee[];
  movements: VacationExportMovement[];
  periods: VacationPeriod[];
  projectedByEmployee?: Map<string, number>;
  requests: VacationExportRequest[];
};

function cell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const type = typeof value === "number" ? "Number" : "String";
  return `<Cell><Data ss:Type="${type}">${escaped}</Data></Cell>`;
}

function row(values: Array<string | number | null | undefined>) {
  return `<Row>${values.map(cell).join("")}</Row>`;
}

function sheet(name: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return `<Worksheet ss:Name="${name}"><Table>${row(headers)}${rows.map(row).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions><AutoFilter x:Range="R1C1:R1C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;
}

export function buildVacationExcelXml(data: VacationExportData) {
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const periodRows = data.periods.map((period) => {
    const employee = period.employeeId ? employeeById.get(period.employeeId) : null;
    return [
      employee?.fullName ?? "",
      employee?.rut ?? "",
      period.periodStart,
      period.periodEnd,
      period.baseDays,
      period.progressiveDays ?? 0,
      (period.positiveAdjustments ?? 0) - (period.negativeAdjustments ?? 0),
      period.usedDays ?? 0,
      period.reservedDays ?? 0,
      period.advanceDays ?? 0,
      period.availableBalance ?? 0,
      period.continuousBlockRequired ?? 10,
      period.continuousBlockUsed ?? 0,
      period.status ?? "open"
    ];
  });
  const summaryRows = data.employees.map((employee) => {
    const periods = data.periods.filter((period) => period.employeeId === employee.id);
    const earned = periods.reduce((sum, period) => sum + (period.availableBalance ?? 0), 0);
    const reserved = periods.reduce((sum, period) => sum + (period.reservedDays ?? 0), 0);
    const advance = periods.reduce((sum, period) => sum + (period.advanceDays ?? 0), 0);
    const progressive = periods.reduce((sum, period) => sum + (period.progressiveDays ?? 0), 0);
    return [
      employee.fullName,
      employee.rut,
      employee.position ?? "",
      employee.area ?? "",
      employee.costCenter ?? "",
      employee.hireDate ?? "",
      earned,
      data.projectedByEmployee?.get(employee.id) ?? 0,
      progressive,
      reserved,
      advance,
      periods.length,
      earned >= 30 ? "Dos periodos o mas pendientes" : ""
    ];
  });
  const movementRows = data.movements.map((movement) => {
    const employee = employeeById.get(movement.employeeId);
    return [employee?.fullName ?? "", employee?.rut ?? "", movement.period, movement.movementType, movement.days, movement.balanceAfter];
  });
  const requestRows = data.requests.map((request) => {
    const employee = employeeById.get(request.employeeId);
    return [employee?.fullName ?? "", employee?.rut ?? "", request.startDate, request.endDate, request.businessDays, request.status, request.resultingBalance, request.documentNumber ?? ""];
  });
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheet("RESUMEN", ["Trabajador", "RUT", "Cargo", "Area", "Centro costo", "Ingreso", "Saldo devengado", "Proporcional proyectado", "Progresivos", "Reservados", "Anticipados", "Periodos", "Alertas"], summaryRows)}
${sheet("DETALLE POR PERIODO", ["Trabajador", "RUT", "Periodo desde", "Periodo hasta", "Base", "Progresivos", "Ajustes", "Usados", "Reservados", "Anticipados", "Saldo", "Bloque requerido", "Bloque usado", "Estado"], periodRows)}
${sheet("MOVIMIENTOS", ["Trabajador", "RUT", "Periodo", "Tipo", "Dias", "Saldo posterior"], movementRows)}
${sheet("SOLICITUDES", ["Trabajador", "RUT", "Inicio", "Termino", "Dias habiles", "Estado", "Saldo posterior", "Documento"], requestRows)}
</Workbook>`;
}
