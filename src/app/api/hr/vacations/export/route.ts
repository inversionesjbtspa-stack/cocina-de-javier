import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { buildVacationExcelXml } from "@/lib/hr/vacation-export";
import { calculateProjectedProportional } from "@/lib/hr/vacation-domain";
import { buildFallbackPeriods, mapPeriodRow } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const supabase = createAdminClient();
  const [employeesResult, periodsResult, requestsResult, movementsResult] = await Promise.all([
    supabase.from("hr_employees").select("id,tenant_id,full_name,rut,position,area,cost_center,hire_date,status").eq("tenant_id", ctx.membership.tenant_id).order("full_name", { ascending: true }),
    supabase.from("hr_vacation_periods").select("*").eq("tenant_id", ctx.membership.tenant_id),
    supabase.from("hr_vacation_requests").select("id,employee_id,start_date,end_date,business_days,status,resulting_balance,document_number,receipt_number").eq("tenant_id", ctx.membership.tenant_id).order("start_date", { ascending: false }),
    supabase.from("hr_vacation_movements").select("employee_id,movement_type,days,resulting_balance,created_at").eq("tenant_id", ctx.membership.tenant_id).order("created_at", { ascending: false })
  ]);
  if (employeesResult.error) return NextResponse.json({ ok: false, error: employeesResult.error.message }, { status: 422 });
  const employees = (employeesResult.data ?? []).map((employee) => ({
    area: employee.area,
    costCenter: employee.cost_center,
    fullName: employee.full_name,
    hireDate: employee.hire_date,
    id: employee.id,
    position: employee.position,
    rut: employee.rut,
    status: employee.status
  }));
  const periods = periodsResult.data?.length
    ? periodsResult.data.map((row) => mapPeriodRow(row as Record<string, unknown>))
    : (employeesResult.data ?? []).flatMap((employee) => buildFallbackPeriods(employee, new Date().toISOString().slice(0, 10)));
  const projected = new Map<string, number>();
  periods.forEach((period) => {
    if (period.employeeId) projected.set(period.employeeId, calculateProjectedProportional((period.baseDays ?? 15) + (period.progressiveDays ?? 0)));
  });
  const xml = buildVacationExcelXml({
    employees,
    movements: (movementsResult.data ?? []).map((movement) => ({
      balanceAfter: Number(movement.resulting_balance ?? 0),
      days: Number(movement.days ?? 0),
      employeeId: movement.employee_id,
      movementType: movement.movement_type,
      period: String(movement.created_at ?? "").slice(0, 10)
    })),
    periods,
    projectedByEmployee: projected,
    requests: (requestsResult.data ?? []).map((request) => ({
      businessDays: Number(request.business_days ?? 0),
      documentNumber: request.document_number ?? request.receipt_number,
      employeeId: request.employee_id,
      endDate: request.end_date,
      id: request.id,
      resultingBalance: Number(request.resulting_balance ?? 0),
      startDate: request.start_date,
      status: request.status
    }))
  });
  const filename = `resumen-vacaciones-${new Date().toISOString().slice(0, 10)}.xls`;
  return new NextResponse(xml, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.ms-excel; charset=utf-8"
    }
  });
}
