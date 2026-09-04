import { formatClp } from "@/lib/dte/purchases-data";
import type { HrDashboardData, HrEmployee } from "@/lib/hr/data";
import { isOperationalVacationRequest } from "@/lib/hr/vacation-domain";
import type { ReactNode } from "react";

function pillClass(status: "ok" | "warn" | "neutral") {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-[#dfe4dd] bg-white text-[#4e5a52]";
}

function SummaryPill({ children, status = "neutral" }: { children: ReactNode; status?: "ok" | "warn" | "neutral" }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${pillClass(status)}`}>{children}</span>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfe4dd] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667068]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-brand-900">{value}</p>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeSummary({ data, employee }: { data: HrDashboardData; employee: HrEmployee }) {
  const periods = data.vacationPeriods.filter((period) => period.employeeId === employee.id);
  const vacations = data.vacations.filter((vacation) => vacation.employeeId === employee.id);
  const payslips = data.payslips.filter((payslip) => payslip.employeeId === employee.id);
  const payments = data.paymentItems.filter((payment) => payment.employeeId === employee.id);
  const documents = [...payslips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
  const vacationAvailable = periods.reduce((sum, period) => sum + period.availableBalance, 0);
  const vacationReserved = periods.reduce((sum, period) => sum + period.reservedDays, 0);
  const vacationUsed = periods.reduce((sum, period) => sum + period.usedDays, 0);
  const currentPeriod = periods.find((period) => period.status === "open") ?? periods[0] ?? null;
  const nextVacation = vacations
    .filter((vacation) => isOperationalVacationRequest(vacation.status) && (vacation.effectiveRestEndDate ?? vacation.endDate) >= todayIso())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const latestPayslip = payslips[0] ?? null;
  const pendingPayments = payments.filter((payment) => ["aprobado", "pendiente_pago", "en_nomina"].includes(payment.status));
  const alerts = [
    !employee.hireDate ? "falta fecha de ingreso" : null,
    !employee.contractType ? "falta contrato" : null,
    employee.paymentAlerts.length ? "banco incompleto" : null,
    !periods.length ? "vacaciones sin periodos persistidos" : null,
    !documents.length ? "sin documentos recientes" : null
  ].filter(Boolean) as string[];

  return (
    <section className="mb-4 rounded-lg border border-[#dfe4dd] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#667068]">Resumen trabajador</p>
          <h3 className="mt-1 text-lg font-semibold text-brand-900">{employee.fullName}</h3>
          <p className="text-sm text-[#667068]">{employee.rut} / {employee.position || "Sin cargo"} / {employee.area || "Sin area"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryPill status={employee.status === "activo" ? "ok" : "warn"}>{employee.status}</SummaryPill>
          <SummaryPill status={employee.paymentAlerts.length ? "warn" : "ok"}>{employee.paymentAlerts.length ? "Banco por revisar" : "Banco completo"}</SummaryPill>
          <SummaryPill status={periods.length ? "ok" : "warn"}>{periods.length ? "Vacaciones persistentes" : "Vacaciones pendientes"}</SummaryPill>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Contrato" value={`${employee.contractType || "Sin tipo"} / ingreso ${employee.hireDate ?? "pendiente"}`} />
        <SummaryMetric label="Vacaciones disponibles" value={`${vacationAvailable.toFixed(2)} dias`} />
        <SummaryMetric label="Ultima liquidacion" value={latestPayslip ? `${latestPayslip.period} / ${formatClp(latestPayslip.netAmount)}` : "Sin liquidacion reciente"} />
        <SummaryMetric label="Pagos pendientes" value={`${pendingPayments.length} / ${formatClp(pendingPayments.reduce((sum, payment) => sum + payment.amount, 0))}`} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-md bg-brand-50 p-3 text-sm">
          <p className="font-semibold text-brand-900">Proximas vacaciones</p>
          <p className="mt-1 text-[#667068]">{nextVacation ? `${nextVacation.startDate} al ${nextVacation.effectiveRestEndDate ?? nextVacation.endDate} / ${nextVacation.businessDays} dias habiles / saldo despues ${nextVacation.resultingBalance.toFixed(2)}` : "Sin vacaciones programadas"}</p>
        </div>
        <div className="rounded-md bg-brand-50 p-3 text-sm">
          <p className="font-semibold text-brand-900">Periodo vigente</p>
          <p className="mt-1 text-[#667068]">{currentPeriod ? `${currentPeriod.periodStart} al ${currentPeriod.periodEnd}` : "No resuelto"}</p>
        </div>
        <div className="rounded-md bg-brand-50 p-3 text-sm">
          <p className="font-semibold text-brand-900">Alertas</p>
          <p className="mt-1 text-[#667068]">{alerts.length ? alerts.join(", ") : `Sin alertas criticas / ${vacationReserved.toFixed(2)} reservados / ${vacationUsed.toFixed(2)} usados`}</p>
        </div>
      </div>
      {vacations[0] ? <p className="mt-3 text-xs text-[#667068]">Ultima solicitud: {vacations[0].startDate} al {vacations[0].endDate} / {vacations[0].status}</p> : null}
    </section>
  );
}
