import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCertifiedVacationStates } from "./vacation-certified-server.ts";
import { getVacationBalanceSummary } from "./vacation-balance-summary.ts";
import { isVacationExportEmployee, type VacationExportData } from "./vacation-export.ts";

type EmployeeRow = { id: string; tenant_id: string; full_name: string; rut: string; position: string | null; area: string | null; cost_center: string | null; hire_date: string | null; status: string };
type RequestRow = { id: string; employee_id: string; start_date: string; end_date: string; business_days: number; status: string; resulting_balance: number; document_number: string | null; receipt_number: string | null };
type MovementRow = { id: string; employee_id: string; movement_type: string; days: number; resulting_balance: number; created_at: string };

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499);
    if (result.error || !result.data) throw new Error("vacation_export_read_failed");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

export async function loadVacationExportData(client: SupabaseClient, tenantId: string, asOf: string): Promise<VacationExportData> {
  const [employeeRows, states, requestRows, movementRows] = await Promise.all([
    readAll<EmployeeRow>((from, to) => client.from("hr_employees")
      .select("id,tenant_id,full_name,rut,position,area,cost_center,hire_date,status").eq("tenant_id", tenantId).eq("status", "activo")
      .order("full_name", { ascending: true }).order("id").range(from, to)),
    loadCertifiedVacationStates(client, tenantId, { required: true }),
    readAll<RequestRow>((from, to) => client.from("hr_vacation_requests")
      .select("id,employee_id,start_date,end_date,business_days,status,resulting_balance,document_number,receipt_number")
      .eq("tenant_id", tenantId).order("start_date", { ascending: false }).order("id").range(from, to)),
    readAll<MovementRow>((from, to) => client.from("hr_vacation_movements")
      .select("id,employee_id,movement_type,days,resulting_balance,created_at")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to))
  ]);
  const employees = employeeRows.map(employee => ({
    id: employee.id, fullName: employee.full_name, rut: employee.rut, hireDate: employee.hire_date,
    position: employee.position, area: employee.area, costCenter: employee.cost_center, status: employee.status
  })).filter(isVacationExportEmployee);
  const summaries = new Map(employees.map(employee => {
    const state = states.find(item => item.opening.employeeId === employee.id);
    if (state && state.opening.tenantId !== tenantId) throw new Error("vacation_summary_owner_mismatch");
    return [employee.id, getVacationBalanceSummary({ employeeId: employee.id, asOf, opening: state?.opening, periods: state?.periods ?? [] })];
  }));
  const ids = new Set(employees.map(employee => employee.id));
  return {
    asOf, employees, summaries,
    movements: movementRows.filter(movement => ids.has(movement.employee_id)).map(movement => ({
      balanceAfter: Number(movement.resulting_balance ?? 0), days: Number(movement.days ?? 0),
      employeeId: movement.employee_id, movementType: movement.movement_type, period: String(movement.created_at ?? "").slice(0, 10)
    })),
    requests: requestRows.filter(request => ids.has(request.employee_id)).map(request => ({
      businessDays: Number(request.business_days ?? 0), documentNumber: request.document_number ?? request.receipt_number,
      employeeId: request.employee_id, endDate: request.end_date, id: request.id,
      resultingBalance: Number(request.resulting_balance ?? 0), startDate: request.start_date, status: request.status
    }))
  };
}
