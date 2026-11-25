import type { VacationAllocation } from "./vacation-domain.ts";
import type { VacationBalanceSummary } from "./vacation-balance-summary.ts";
import { isProductiveHrEmployee } from "./employee-filters.ts";

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
  asOf: string;
  employees: VacationExportEmployee[];
  movements: VacationExportMovement[];
  summaries: ReadonlyMap<string, VacationBalanceSummary>;
  requests: VacationExportRequest[];
};

export function isVacationExportEmployee(employee: VacationExportEmployee) {
  const name = employee.fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return employee.status === "activo" && isProductiveHrEmployee(employee)
    && !/\b(CODEX|FIXTURE|FICTICIO|SYNTHETIC|TEST|PRUEBA)\b/.test(name);
}

export const VACATION_SUMMARY_HEADERS = [
  "Trabajador", "RUT", "Cargo", "Area", "Centro costo", "Ingreso", "SALDO DISPONIBLE", "Saldo certificado",
  "Devengados post-corte", "Ajustes post-corte", "Utilizados post-corte", "Reservados",
  "Derecho anual", "Feriado progresivo", "Proxima anualidad",
  "Proporcional proyectado (dias/mes; no disponible)", "Anticipados", "Periodos informativos", "Alertas", "Estado saldo"
];

function cell(value: string | number | null | undefined, style?: string) {
  if (value == null) return "<Cell/>";
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("vacation_export_invalid_number");
  const text = String(value);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const type = typeof value === "number" ? "Number" : "String";
  return `<Cell ss:StyleID="${style ?? "Text"}"><Data ss:Type="${type}">${escaped}</Data></Cell>`;
}

function row(values: Array<string | number | null | undefined>, headers: string[], header = false) {
  return `<Row${header ? ' ss:Height="48"' : ' ss:AutoFitHeight="1"'}>${values.map((value, index) => {
    const primary = headers[index] === "SALDO DISPONIBLE";
    const style = header ? (primary ? "PrimaryHeader" : "Header") : value === "N/D" ? "Missing"
      : primary ? "AvailableBalance" : typeof value === "number"
        ? headers[index]?.startsWith("Proporcional proyectado") ? "Projection" : headers[index] === "Periodos informativos" ? "Count" : "Days" : "Text";
    return cell(value, style);
  }).join("")}</Row>`;
}

function sheet(name: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const columns = headers.map((_, index) => `<Column ss:Width="${index === 0 ? 230 : index === 18 ? 260 : index === 19 ? 185 : index === 15 ? 145 : 110}"/>`).join("");
  return `<Worksheet ss:Name="${name}"><Table>${columns}${row(headers, headers, true)}${rows.map(values => row(values, headers)).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions><AutoFilter x:Range="R1C1:R${rows.length + 1}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;
}

export function buildVacationExcelXml(data: VacationExportData) {
  const employees = data.employees.filter(isVacationExportEmployee);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  if (employeeById.size !== employees.length) throw new Error("vacation_export_duplicate_employee");
  const summaries = employees.map(employee => {
    const summary = data.summaries.get(employee.id);
    if (!summary || summary.employeeId !== employee.id || summary.asOf !== data.asOf) throw new Error("vacation_export_summary_mismatch");
    return summary;
  });
  const periodRows = summaries.flatMap(summary => summary.periods).map((period) => {
    const employee = period.employeeId ? employeeById.get(period.employeeId) : null;
    if (!employee) throw new Error("vacation_export_period_owner_missing");
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
      period.status ?? "open",
      period.openingBalanceId ? "Saldo certificado / anualidad post-corte" : "Periodo operativo",
      period.earnedOn ?? ""
    ];
  });
  const summaryRows = employees.map((employee, index) => {
    const summary = summaries[index];
    return [
      employee.fullName,
      employee.rut,
      employee.position ?? "",
      employee.area ?? "",
      employee.costCenter ?? "",
      employee.hireDate ?? "",
      summary.availableBalance ?? "N/D",
      summary.certifiedBalance,
      summary.accruedPostCutoff,
      summary.adjustments,
      summary.used,
      summary.reserved,
      summary.annualEntitlement,
      summary.progressiveDays,
      summary.nextAnniversary,
      summary.projectedProportional,
      summary.advanceDays,
      summary.informativePeriods,
      summary.alerts.join("; "),
      summary.status
    ].map((value, column) => column >= 6 && column <= 17 && value == null ? "N/D" : value);
  });
  const movementRows = data.movements.filter(movement => employeeById.has(movement.employeeId)).map((movement) => {
    const employee = employeeById.get(movement.employeeId);
    return [employee?.fullName ?? "", employee?.rut ?? "", movement.period, movement.movementType, movement.days, movement.balanceAfter];
  });
  const requestRows = data.requests.filter(request => employeeById.has(request.employeeId)).map((request) => {
    const employee = employeeById.get(request.employeeId);
    return [employee?.fullName ?? "", employee?.rut ?? "", request.startDate, request.endDate, request.businessDays, request.status, request.resultingBalance, request.documentNumber ?? ""];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Text"><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#245344" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="PrimaryHeader" ss:Parent="Header"><Interior ss:Color="#163E31" ss:Pattern="Solid"/></Style><Style ss:ID="AvailableBalance"><Font ss:Bold="1" ss:Color="#163E31"/><Interior ss:Color="#E5F0EB" ss:Pattern="Solid"/><NumberFormat ss:Format="0.00"/></Style><Style ss:ID="Missing"><Font ss:Bold="1" ss:Color="#805500"/><Interior ss:Color="#FFF4D6" ss:Pattern="Solid"/></Style><Style ss:ID="Days"><NumberFormat ss:Format="0.00"/></Style><Style ss:ID="Projection"><NumberFormat ss:Format="0.000000"/></Style><Style ss:ID="Count"><NumberFormat ss:Format="0"/></Style></Styles>
${sheet("RESUMEN", VACATION_SUMMARY_HEADERS, summaryRows)}
${sheet("DETALLE POR PERIODO", ["Trabajador", "RUT", "Periodo desde", "Periodo hasta", "Base", "Progresivos", "Ajustes", "Usados", "Reservados", "Anticipados", "Saldo", "Bloque requerido", "Bloque usado", "Estado", "Origen", "Devengado el"], periodRows)}
${sheet("MOVIMIENTOS", ["Trabajador", "RUT", "Periodo", "Tipo", "Dias", "Saldo posterior"], movementRows)}
${sheet("SOLICITUDES", ["Trabajador", "RUT", "Inicio", "Termino", "Dias habiles", "Estado", "Saldo posterior", "Documento"], requestRows)}
</Workbook>`;
}
