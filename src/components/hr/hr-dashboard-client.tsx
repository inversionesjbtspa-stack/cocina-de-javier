"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BadgeDollarSign, CalendarDays, Download, FileText, Landmark, Upload, UserPlus, Users } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { HrDashboardData, HrEmployee } from "@/lib/hr/data";

function monthToday() {
  return new Date().toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function HrDashboardClient({ data }: { data: HrDashboardData }) {
  const [employees, setEmployees] = useState(data.employees);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(data.employees[0]?.id ?? "");
  const [paymentSelection, setPaymentSelection] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0] ?? null;
  const approvedPaymentItems = data.paymentItems.filter((item) => item.status === "aprobado");

  const kpis = [
    { icon: Users, label: "Trabajadores activos", value: String(data.kpis.activeEmployees), sub: `${data.kpis.paymentEnabled} habilitados para pago` },
    { icon: FileText, label: "Liquidaciones cargadas", value: String(data.kpis.payslipsLoaded), sub: `${data.kpis.payslipsMissing} faltantes del mes` },
    { icon: CalendarDays, label: "Vacaciones pendientes", value: String(data.kpis.vacationPending), sub: `${data.kpis.vacationTaken} dias tomados` },
    { icon: Landmark, label: "Sin cuenta bancaria", value: String(data.kpis.employeesWithoutBank), sub: "Requiere completar ficha" },
    { icon: BadgeDollarSign, label: "Monto a pagar mes", value: formatClp(data.kpis.monthPaymentAmount), sub: "Pagos aprobados RRHH" },
    { icon: BadgeDollarSign, label: "Liquido liquidaciones", value: formatClp(data.kpis.netPayrollAmount), sub: "Total liquido cargado" },
    { icon: BadgeDollarSign, label: "Anticipos / bonos", value: formatClp(data.kpis.advancesAmount + data.kpis.bonusesAmount), sub: "Incluidos en submodulos" }
  ];

  async function submitJson(event: FormEvent<HTMLFormElement>, endpoint: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setMessage(null);
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "Operacion rechazada");
      return;
    }
    setMessage(success);
    form.reset();
    if (payload?.employee) {
      location.reload();
    }
  }

  async function updateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee) return;
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/hr/employees/${selectedEmployee.id}`, {
      body: JSON.stringify({
        ...body,
        paymentEnabled: body.paymentEnabled === "on"
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo actualizar trabajador");
      return;
    }
    setMessage("Ficha actualizada.");
    setEmployees((current) => current.map((employee) => employee.id === selectedEmployee.id ? { ...employee, paymentEnabled: body.paymentEnabled === "on", status: String(body.status ?? employee.status) } : employee));
  }

  async function uploadPayslip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await fetch("/api/hr/payslips", { body: new FormData(form), method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo cargar liquidacion");
      return;
    }
    setMessage("Liquidacion cargada.");
    form.reset();
  }

  async function importPayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("Importando liquidaciones y datos sueldo...");
    const response = await fetch("/api/hr/payroll-import", { body: new FormData(form), method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo importar RRHH abril 2026.");
      return;
    }
    setMessage(`Importacion completa: ${payload.parsedPayslips} liquidaciones leidas, ${payload.payslipsSaved} guardadas, ${payload.accountantRowsImported} filas contador.`);
    form.reset();
  }

  async function importBankAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("Importando cuentas bancarias RRHH...");
    const response = await fetch("/api/hr/bank-import", { body: new FormData(form), method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo importar cuentas bancarias.");
      return;
    }
    setMessage(`Cuentas bancarias importadas: ${payload.imported} filas, ${payload.inserted} nuevas, ${payload.updated} actualizadas, ${payload.enabled} trabajadores habilitados, ${payload.unmatched?.length ?? 0} sin match.`);
    form.reset();
  }

  async function generatePayroll() {
    if (!paymentSelection.length) {
      setMessage("Selecciona pagos aprobados antes de exportar.");
      return;
    }
    const glosaGlobal = (document.getElementById("hr-glosa-global") as HTMLInputElement | null)?.value ?? "";
    const response = await fetch("/api/hr/payment-template", {
      body: JSON.stringify({ glosaGlobal, paymentItemIds: paymentSelection, payDate: today() }),
      headers: { "content-type": "application/json", "x-erp-request": "hr" },
      method: "POST"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setMessage(payload?.invalid?.length ? `No exportado: ${payload.invalid.length} trabajador(es) con datos incompletos.` : payload?.error ?? "No se pudo generar nomina RRHH");
      return;
    }
    download(await response.blob(), "Template Pagos JESUS - RRHH.xlsx");
    setMessage("Nomina RRHH exportada con Template Pagos JESUS.");
  }

  const paymentEnabledEmployees = useMemo(() => employees.filter((employee) => employee.status === "activo" && employee.paymentEnabled), [employees]);

  return (
    <section className="space-y-6">
      {message ? <div className="rounded-md border border-[#dfe4dd] bg-white px-4 py-3 text-sm font-medium text-brand-900 shadow-sm">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm" key={item.label}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#667068]">{item.label}</p>
                <Icon className="h-5 w-5 text-brand-700" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-brand-900">{item.value}</p>
              <p className="mt-1 text-xs text-[#667068]">{item.sub}</p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold text-brand-900">Nueva ficha trabajador</h2>
          </div>
          <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => submitJson(event, "/api/hr/employees", "Trabajador creado.")}>
            <input className="rounded-md border px-3 py-2 text-sm" name="rut" placeholder="RUT" required />
            <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" name="fullName" placeholder="Nombre completo" required />
            <input className="rounded-md border px-3 py-2 text-sm" name="position" placeholder="Cargo" />
            <input className="rounded-md border px-3 py-2 text-sm" name="area" placeholder="Area" />
            <input className="rounded-md border px-3 py-2 text-sm" name="hireDate" type="date" />
            <select className="rounded-md border px-3 py-2 text-sm" name="contractType"><option value="contratado">Contratado</option><option value="part_time">Part time</option><option value="honorarios">Honorarios</option></select>
            <select className="rounded-md border px-3 py-2 text-sm" name="status"><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="finiquitado">Finiquitado</option><option value="suspendido">Suspendido</option></select>
            <input className="rounded-md border px-3 py-2 text-sm" name="salary" placeholder="Sueldo base" type="number" />
            <input className="rounded-md border px-3 py-2 text-sm" name="phone" placeholder="Telefono" />
            <input className="rounded-md border px-3 py-2 text-sm" name="personalEmail" placeholder="Email personal" type="email" />
            <input className="rounded-md border px-3 py-2 text-sm" name="workEmail" placeholder="Email laboral" type="email" />
            <input className="rounded-md border px-3 py-2 text-sm" name="bankName" placeholder="Banco" />
            <input className="rounded-md border px-3 py-2 text-sm" name="bankCode" placeholder="Codigo banco" />
            <input className="rounded-md border px-3 py-2 text-sm" name="tipoCuenta" placeholder="Tipo cuenta" />
            <input className="rounded-md border px-3 py-2 text-sm" name="bankAccount" placeholder="Numero cuenta" />
            <input className="rounded-md border px-3 py-2 text-sm" name="emailPayment" placeholder="Email pago" type="email" />
            <label className="flex items-center gap-2 text-sm"><input name="paymentEnabled" type="checkbox" /> Habilitar pagos</label>
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-3" type="submit">Crear trabajador</button>
          </form>
        </article>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-brand-900">Ficha editable</h2>
          <select className="mt-4 w-full rounded-md border px-3 py-2 text-sm" onChange={(event) => setSelectedEmployeeId(event.target.value)} value={selectedEmployee?.id ?? ""}>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} / {employee.rut}</option>)}
          </select>
          {selectedEmployee ? <EmployeeDetail employee={selectedEmployee} onSubmit={updateEmployee} /> : <p className="mt-4 text-sm text-[#667068]">Sin trabajadores creados.</p>}
        </article>
      </div>

      <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold text-brand-900">Importacion abril 2026 y datos para contador</h2>
            <p className="mt-1 text-sm text-[#667068]">
              Carga el PDF consolidado de liquidaciones y el Excel Datos Sueldos. El sistema crea/actualiza trabajadores por RUT, guarda liquidaciones individuales y prepara la exportacion con el mismo formato del Excel original.
            </p>
          </div>
          <a className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" href="/api/hr/accountant-data?period=2026-04">
            Exportar Datos Sueldos abril 2026
          </a>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={importPayroll}>
          <label className="text-sm font-medium text-[#667068]">Periodo<input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" defaultValue="2026-04" name="period" type="month" /></label>
          <label className="text-sm font-medium text-[#667068] md:col-span-1">Liquidaciones PDF<input accept="application/pdf" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" name="payslipsPdf" required type="file" /></label>
          <label className="text-sm font-medium text-[#667068] md:col-span-1">Datos sueldos Excel<input accept=".xlsx" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" name="salaryDataXlsx" type="file" /></label>
          <div className="flex items-end"><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit"><Upload className="h-4 w-4" /> Importar reales</button></div>
        </form>
        <form className="mt-4 grid gap-3 border-t border-[#dfe4dd] pt-4 md:grid-cols-[1fr_auto]" onSubmit={importBankAccounts}>
          <label className="text-sm font-medium text-[#667068]">
            Excel bancario trabajadores
            <input accept=".xls,.xlsx" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" name="bankFile" required type="file" />
          </label>
          <div className="flex items-end">
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" type="submit">
              <Upload className="h-4 w-4" /> Importar cuentas bancarias
            </button>
          </div>
        </form>
      </article>

      <div className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-brand-900">Liquidaciones</h2>
          <form className="mt-4 space-y-3" onSubmit={uploadPayslip}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
            <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="netAmount" placeholder="Monto liquido" type="number" />
            <input accept="application/pdf" className="w-full rounded-md border px-3 py-2 text-sm" name="file" required type="file" />
            <button className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit"><Upload className="h-4 w-4" /> Cargar PDF</button>
          </form>
          <div className="mt-5 space-y-2">{data.payslips.slice(0, 6).map((payslip) => <a className="block rounded-md border p-3 text-sm hover:bg-brand-50" href={`/api/hr/payslips/${payslip.id}/download`} key={payslip.id}>{payslip.employeeName} / {payslip.period} / {payslip.status}</a>)}</div>
        </article>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-brand-900">Vacaciones y papeletas</h2>
          <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations", "Vacaciones registradas.")}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="startDate" type="date" required />
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="endDate" type="date" required />
            <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="solicitada">Solicitada</option><option value="aprobada">Aprobada</option><option value="tomada">Tomada</option><option value="rechazada">Rechazada</option></select>
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="observation" placeholder="Observacion" />
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Registrar vacaciones</button>
          </form>
          <div className="mt-5 space-y-2">{data.vacations.slice(0, 6).map((vacation) => <div className="rounded-md border p-3 text-sm" key={vacation.id}><p className="font-semibold">{vacation.employeeName}</p><p>{vacation.startDate} al {vacation.endDate} / {vacation.businessDays} dias</p><a className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700" href={`/api/hr/vacations/${vacation.id}/papeleta`} target="_blank"><Download className="h-3.5 w-3.5" /> Papeleta PDF</a></div>)}</div>
        </article>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-brand-900">Pagos RRHH</h2>
          <p className="mt-1 text-sm text-[#667068]">{paymentEnabledEmployees.length} trabajadores habilitados para pago.</p>
          <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/payments", "Pago RRHH creado.")}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
            <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={monthToday()} name="period" type="month" />
            <select className="w-full rounded-md border px-3 py-2 text-sm" name="paymentType"><option value="remuneracion_mensual">Remuneracion mensual</option><option value="anticipo">Anticipo</option><option value="honorarios">Honorarios</option><option value="finiquito">Finiquito</option><option value="bono_compensatorio">Bono compensatorio</option><option value="bono_extra">Bono extra</option><option value="aguinaldo">Aguinaldo</option><option value="compensacion">Compensacion</option><option value="otro">Otro</option></select>
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="amount" placeholder="Monto" required type="number" />
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="glosa" placeholder="Glosa individual" />
            <input className="w-full rounded-md border px-3 py-2 text-sm" name="scheduledDate" type="date" />
            <input name="status" type="hidden" value="aprobado" />
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Crear pago aprobado</button>
          </form>
          <div className="mt-5 border-t pt-4">
            <input className="w-full rounded-md border px-3 py-2 text-sm" id="hr-glosa-global" placeholder="Glosa global nomina" />
            <div className="mt-3 max-h-48 overflow-auto space-y-2">
              {approvedPaymentItems.map((item) => <label className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm" key={item.id}><span><input className="mr-2" checked={paymentSelection.includes(item.id)} onChange={() => setPaymentSelection((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} type="checkbox" />{item.employeeName} / {item.paymentType}</span><strong>{formatClp(item.amount)}</strong></label>)}
            </div>
            <button className="mt-3 w-full rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" onClick={generatePayroll} type="button">Exportar Template Pagos JESUS</button>
          </div>
        </article>
      </div>
    </section>
  );
}

function EmployeeDetail({ employee, onSubmit }: { employee: HrEmployee; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <div className="rounded-md bg-brand-50 p-3 text-sm">
        <p className="font-semibold text-brand-900">{employee.fullName}</p>
        <p className="text-[#667068]">{employee.position || "Sin cargo"} / {employee.status}</p>
        <p className={employee.paymentAlerts.length ? "mt-2 text-amber-800" : "mt-2 text-emerald-700"}>
          {employee.paymentAlerts.length ? `Faltan datos: ${employee.paymentAlerts.join(", ")}` : "Apto para pago"}
        </p>
      </div>
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.fullName} name="fullName" placeholder="Nombre" />
      <select className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.status} name="status"><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="finiquitado">Finiquitado</option><option value="suspendido">Suspendido</option></select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.bankName ?? ""} name="bankName" placeholder="Banco" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.bankCode ?? ""} name="bankCode" placeholder="Codigo banco" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.accountType ?? ""} name="tipoCuenta" placeholder="Tipo cuenta" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.accountNumber ?? ""} name="bankAccount" placeholder="Numero cuenta" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.paymentEmail ?? employee.workEmail ?? employee.personalEmail ?? ""} name="emailPayment" placeholder="Email pago" type="email" />
      <label className="flex items-center gap-2 text-sm"><input defaultChecked={employee.paymentEnabled} name="paymentEnabled" type="checkbox" /> Habilitar pagos</label>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="reason" placeholder="Motivo cambio habilitacion" />
      <button className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Guardar ficha</button>
    </form>
  );
}
