"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Landmark,
  LayoutDashboard,
  Search,
  SlidersHorizontal,
  TableProperties,
  Upload,
  UserPlus,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { HrDashboardData, HrEmployee } from "@/lib/hr/data";

type HrSection = "workers" | "payroll" | "salary" | "payslips" | "imports" | "dashboard";
type WorkerTab = "personal" | "contract" | "bank" | "novelties" | "vacations" | "payslips" | "payments" | "documents" | "audit";
type WorkerSort = "name" | "status" | "area" | "vacations" | "payments";
type HrPaymentItem = HrDashboardData["paymentItems"][number];

const sections: Array<{ icon: typeof Users; id: HrSection; label: string }> = [
  { icon: Users, id: "workers", label: "Trabajadores" },
  { icon: WalletCards, id: "payroll", label: "Nominas" },
  { icon: TableProperties, id: "salary", label: "Datos Sueldos" },
  { icon: FileText, id: "payslips", label: "Liquidaciones" },
  { icon: Upload, id: "imports", label: "Importaciones" },
  { icon: LayoutDashboard, id: "dashboard", label: "Dashboard" }
];

const workerTabs: Array<{ id: WorkerTab; label: string }> = [
  { id: "personal", label: "Datos personales" },
  { id: "contract", label: "Contrato" },
  { id: "bank", label: "Banco" },
  { id: "novelties", label: "Novedades" },
  { id: "vacations", label: "Vacaciones" },
  { id: "payslips", label: "Liquidaciones" },
  { id: "payments", label: "Pagos" },
  { id: "documents", label: "Documentos" },
  { id: "audit", label: "Auditoria" }
];

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

function statusClass(status: string) {
  if (status === "activo" || status === "pagado" || status === "aprobado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "pendiente_pago" || status === "en_nomina" || status === "solicitada") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "anulado" || status === "rechazado" || status === "finiquitado") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-[#dfe4dd] bg-white text-[#4e5a52]";
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <article className={`rounded-lg border border-[#dfe4dd] bg-white shadow-sm ${className}`}>{children}</article>;
}

export function HrDashboardClient({ data }: { data: HrDashboardData }) {
  const [activeSection, setActiveSection] = useState<HrSection>("workers");
  const [employees, setEmployees] = useState(data.employees);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(data.employees[0]?.id ?? "");
  const [profileOpen, setProfileOpen] = useState(false);
  const [workerTab, setWorkerTab] = useState<WorkerTab>("personal");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerStatusFilter, setWorkerStatusFilter] = useState("");
  const [workerAreaFilter, setWorkerAreaFilter] = useState("");
  const [workerSort, setWorkerSort] = useState<WorkerSort>("name");
  const [paymentSelection, setPaymentSelection] = useState<string[]>([]);
  const [paymentAreaFilter, setPaymentAreaFilter] = useState("");
  const [paymentPositionFilter, setPaymentPositionFilter] = useState("");
  const [paymentSort, setPaymentSort] = useState("name");
  const [message, setMessage] = useState<string | null>(null);

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0] ?? null;
  const payablePaymentItems = data.paymentItems.filter((item) => ["aprobado", "pendiente_pago"].includes(item.status));
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const kpis = [
    { icon: Users, label: "Trabajadores activos", value: String(data.kpis.activeEmployees), sub: `${data.kpis.paymentEnabled} habilitados para pago` },
    { icon: FileText, label: "Liquidaciones cargadas", value: String(data.kpis.payslipsLoaded), sub: `${data.kpis.payslipsMissing} faltantes del mes` },
    { icon: CalendarDays, label: "Vacaciones pendientes", value: String(data.kpis.vacationPending), sub: `${data.kpis.vacationTaken} dias tomados` },
    { icon: Landmark, label: "Sin cuenta bancaria", value: String(data.kpis.employeesWithoutBank), sub: "Requiere completar ficha" },
    { icon: BadgeDollarSign, label: "Monto a pagar mes", value: formatClp(data.kpis.monthPaymentAmount), sub: "Pagos aprobados RRHH" },
    { icon: BadgeDollarSign, label: "Liquido liquidaciones", value: formatClp(data.kpis.netPayrollAmount), sub: "Total liquido cargado" },
    { icon: BadgeDollarSign, label: "Anticipos / bonos", value: formatClp(data.kpis.advancesAmount + data.kpis.bonusesAmount), sub: "Incluidos en submodulos" }
  ];

  const areas = useMemo(() => Array.from(new Set(employees.map((employee) => employee.area).filter(Boolean) as string[])).sort(), [employees]);
  const positions = useMemo(() => Array.from(new Set(employees.map((employee) => employee.position).filter(Boolean) as string[])).sort(), [employees]);
  const statuses = useMemo(() => Array.from(new Set(employees.map((employee) => employee.status).filter(Boolean))).sort(), [employees]);

  const filteredEmployees = (() => {
    const search = workerSearch.trim().toLowerCase();
    return employees
      .filter((employee) => {
        const searchable = `${employee.fullName} ${employee.rut} ${employee.position ?? ""} ${employee.area ?? ""}`.toLowerCase();
        return (!search || searchable.includes(search)) && (!workerStatusFilter || employee.status === workerStatusFilter) && (!workerAreaFilter || employee.area === workerAreaFilter);
      })
      .sort((a, b) => {
        if (workerSort === "status") return a.status.localeCompare(b.status) || a.fullName.localeCompare(b.fullName);
        if (workerSort === "area") return (a.area ?? "").localeCompare(b.area ?? "") || a.fullName.localeCompare(b.fullName);
        if (workerSort === "vacations") return vacationsFor(b.id).length - vacationsFor(a.id).length || a.fullName.localeCompare(b.fullName);
        if (workerSort === "payments") return paymentsFor(b.id).length - paymentsFor(a.id).length || a.fullName.localeCompare(b.fullName);
        return a.fullName.localeCompare(b.fullName);
      });
  })();

  const filteredPaymentItems = useMemo(() => {
    return payablePaymentItems
      .filter((item) => {
        const employee = employeeById.get(item.employeeId);
        return (!paymentAreaFilter || employee?.area === paymentAreaFilter) && (!paymentPositionFilter || employee?.position === paymentPositionFilter);
      })
      .sort((a, b) => {
        const employeeA = employeeById.get(a.employeeId);
        const employeeB = employeeById.get(b.employeeId);
        if (paymentSort === "amount_desc") return b.amount - a.amount;
        if (paymentSort === "amount_asc") return a.amount - b.amount;
        if (paymentSort === "status") return a.status.localeCompare(b.status);
        return (employeeA?.fullName ?? a.employeeName).localeCompare(employeeB?.fullName ?? b.employeeName);
      });
  }, [employeeById, payablePaymentItems, paymentAreaFilter, paymentPositionFilter, paymentSort]);

  function openProfile(employee: HrEmployee, tab: WorkerTab = "personal") {
    setSelectedEmployeeId(employee.id);
    setWorkerTab(tab);
    setProfileOpen(true);
  }

  function paymentsFor(employeeId: string) {
    return data.paymentItems.filter((item) => item.employeeId === employeeId);
  }

  function payslipsFor(employeeId: string) {
    return data.payslips.filter((item) => item.employeeId === employeeId);
  }

  function vacationsFor(employeeId: string) {
    return data.vacations.filter((item) => item.employeeId === employeeId);
  }

  function noveltiesFor(employeeId: string) {
    return data.monthlyNovelties.filter((item) => item.employeeId === employeeId);
  }

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
    const payload: Record<string, FormDataEntryValue | boolean> = { ...body };
    if ("paymentEnabled" in body) {
      payload.paymentEnabled = body.paymentEnabled === "on";
    }
    const response = await fetch(`/api/hr/employees/${selectedEmployee.id}`, {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(result?.error ?? "No se pudo actualizar trabajador");
      return;
    }
    setMessage("Ficha actualizada.");
    setEmployees((current) => current.map((employee) => {
      if (employee.id !== selectedEmployee.id) return employee;
      return {
        ...employee,
        area: typeof body.area === "string" ? body.area : employee.area,
        fullName: typeof body.fullName === "string" ? body.fullName : employee.fullName,
        paymentEnabled: "paymentEnabled" in body ? body.paymentEnabled === "on" : employee.paymentEnabled,
        position: typeof body.position === "string" ? body.position : employee.position,
        status: typeof body.status === "string" ? body.status : employee.status
      };
    }));
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

  async function saveNovelty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/hr/monthly-novelties", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo guardar novedad mensual.");
      return;
    }
    setMessage("Novedad mensual guardada sin duplicar trabajador + periodo + tipo.");
    form.reset();
  }

  async function saveAccountantRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/hr/accountant-data", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo guardar Datos Sueldos.");
      return;
    }
    setMessage("Datos Sueldos guardado para el periodo.");
    form.reset();
  }

  async function generatePayroll() {
    if (!paymentSelection.length) {
      setMessage("Selecciona pagos aprobados antes de exportar.");
      return;
    }
    const glosaGlobal = (document.getElementById("hr-glosa-global") as HTMLInputElement | null)?.value ?? "";
    const response = await fetch("/api/hr/payment-template", {
      body: JSON.stringify({
        glosaGlobal,
        paymentItemIds: paymentSelection,
        payDate: today(),
        selectionFilters: { area: paymentAreaFilter, position: paymentPositionFilter, sort: paymentSort },
        trancheLabel: (document.getElementById("hr-tranche-label") as HTMLInputElement | null)?.value ?? ""
      }),
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

  async function markSelectedPaid() {
    if (!paymentSelection.length) {
      setMessage("Selecciona pagos para marcarlos como pagados.");
      return;
    }
    const results = await Promise.all(paymentSelection.map((id) => fetch(`/api/hr/payments/${id}`, {
      body: JSON.stringify({ paymentDate: today(), status: "pagado" }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    })));
    const failed = results.filter((response) => !response.ok).length;
    setMessage(failed ? `${failed} pago(s) no se pudieron marcar como pagados.` : "Pagos seleccionados marcados como pagados.");
  }

  async function sendPayslips(payslipIds: string[], resend = false) {
    if (!payslipIds.length) {
      setMessage("No hay liquidaciones seleccionadas para enviar.");
      return;
    }
    const response = await fetch("/api/hr/payslips/send", {
      body: JSON.stringify({ payslipIds, resend }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "No se pudo preparar el envio de liquidaciones.");
      return;
    }
    const blocked = payload?.results?.filter((item: { status: string }) => item.status !== "enviado").length ?? 0;
    setMessage(blocked ? `Envio controlado revisado: ${blocked} liquidacion(es) quedaron pendientes/bloqueadas.` : "Liquidaciones enviadas.");
  }

  return (
    <section className="space-y-5">
      {message ? <div className="rounded-md border border-[#dfe4dd] bg-white px-4 py-3 text-sm font-medium text-brand-900 shadow-sm">{message}</div> : null}

      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-[#dfe4dd] bg-white p-2 shadow-sm">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${active ? "bg-brand-700 text-white" : "text-[#4e5a52] hover:bg-brand-50 hover:text-brand-900"}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </button>
          );
        })}
      </nav>

      {activeSection === "workers" ? (
        <WorkersSection
          areas={areas}
          employees={filteredEmployees}
          onCreate={(event) => submitJson(event, "/api/hr/employees", "Trabajador creado.")}
          onOpen={openProfile}
          search={workerSearch}
          setArea={setWorkerAreaFilter}
          setSearch={setWorkerSearch}
          setSort={setWorkerSort}
          setStatus={setWorkerStatusFilter}
          sort={workerSort}
          status={workerStatusFilter}
          statuses={statuses}
          vacationsFor={vacationsFor}
          paymentsFor={paymentsFor}
          payslipsFor={payslipsFor}
          area={workerAreaFilter}
        />
      ) : null}

      {activeSection === "payroll" ? (
        <PayrollSection
          areas={areas}
          data={data}
          employees={employees}
          filteredPaymentItems={filteredPaymentItems}
          generatePayroll={generatePayroll}
          markSelectedPaid={markSelectedPaid}
          paymentAreaFilter={paymentAreaFilter}
          paymentPositionFilter={paymentPositionFilter}
          paymentSelection={paymentSelection}
          paymentSort={paymentSort}
          positions={positions}
          setPaymentAreaFilter={setPaymentAreaFilter}
          setPaymentPositionFilter={setPaymentPositionFilter}
          setPaymentSelection={setPaymentSelection}
          setPaymentSort={setPaymentSort}
          submitJson={submitJson}
        />
      ) : null}

      {activeSection === "salary" ? <SalaryDataSection data={data} onSave={saveAccountantRow} /> : null}
      {activeSection === "payslips" ? <PayslipsSection data={data} employees={employees} sendPayslips={sendPayslips} uploadPayslip={uploadPayslip} /> : null}
      {activeSection === "imports" ? <ImportsSection importBankAccounts={importBankAccounts} importPayroll={importPayroll} /> : null}
      {activeSection === "dashboard" ? <DashboardSection kpis={kpis} /> : null}

      {profileOpen && selectedEmployee ? (
        <WorkerProfilePanel
          data={data}
          employee={selectedEmployee}
          novelties={noveltiesFor(selectedEmployee.id)}
          onClose={() => setProfileOpen(false)}
          onSubmit={updateEmployee}
          payslips={payslipsFor(selectedEmployee.id)}
          payments={paymentsFor(selectedEmployee.id)}
          saveNovelty={saveNovelty}
          selectedTab={workerTab}
          setSelectedTab={setWorkerTab}
          submitJson={submitJson}
          uploadPayslip={uploadPayslip}
          vacations={vacationsFor(selectedEmployee.id)}
          sendPayslips={sendPayslips}
        />
      ) : null}
    </section>
  );
}

function WorkersSection({
  area,
  areas,
  employees,
  onCreate,
  onOpen,
  paymentsFor,
  payslipsFor,
  search,
  setArea,
  setSearch,
  setSort,
  setStatus,
  sort,
  status,
  statuses,
  vacationsFor
}: {
  area: string;
  areas: string[];
  employees: HrEmployee[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onOpen: (employee: HrEmployee, tab?: WorkerTab) => void;
  paymentsFor: (employeeId: string) => HrDashboardData["paymentItems"];
  payslipsFor: (employeeId: string) => HrDashboardData["payslips"];
  search: string;
  setArea: (value: string) => void;
  setSearch: (value: string) => void;
  setSort: (value: WorkerSort) => void;
  setStatus: (value: string) => void;
  sort: WorkerSort;
  status: string;
  statuses: string[];
  vacationsFor: (employeeId: string) => HrDashboardData["vacations"];
}) {
  return (
    <div className="space-y-4">
      <SectionCard className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">Trabajadores</h2>
            <p className="text-sm text-[#667068]">Vista principal RRHH centrada en la ficha del trabajador.</p>
          </div>
          <details className="group">
            <summary className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white">
              <UserPlus className="h-4 w-4" />
              Nuevo trabajador
            </summary>
            <div className="mt-4 rounded-lg border border-[#dfe4dd] bg-brand-50 p-4">
              <NewEmployeeForm onSubmit={onCreate} />
            </div>
          </details>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#667068]" />
            <input className="w-full rounded-md border border-[#dfe4dd] py-2 pl-9 pr-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, RUT, cargo o area" value={search} />
          </label>
          <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">Todos los estados</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setArea(event.target.value)} value={area}>
            <option value="">Todas las areas</option>
            {areas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setSort(event.target.value as WorkerSort)} value={sort}>
            <option value="name">Orden nombre</option>
            <option value="status">Orden estado</option>
            <option value="area">Orden area</option>
            <option value="vacations">Mas vacaciones</option>
            <option value="payments">Mas pagos</option>
          </select>
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-[#dfe4dd] bg-brand-50 text-xs uppercase text-[#667068]">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Vacaciones</th>
                <th className="px-4 py-3">Liquidaciones</th>
                <th className="px-4 py-3">Pagos</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const vacations = vacationsFor(employee.id);
                const payslips = payslipsFor(employee.id);
                const payments = paymentsFor(employee.id);
                return (
                  <tr className="border-b border-[#eef1ed] align-top hover:bg-[#fbfaf8]" key={employee.id}>
                    <td className="px-4 py-3">
                      <button className="text-left font-semibold text-brand-900 hover:text-brand-700" onClick={() => onOpen(employee)} type="button">{employee.fullName}</button>
                      <p className="mt-1 text-xs text-[#667068]">{employee.workEmail || employee.personalEmail || "Sin email"}</p>
                    </td>
                    <td className="px-4 py-3 text-[#4e5a52]">{employee.rut}</td>
                    <td className="px-4 py-3">{employee.position || "Sin cargo"}</td>
                    <td className="px-4 py-3">{employee.area || "Sin area"}</td>
                    <td className="px-4 py-3"><Pill className={statusClass(employee.status)}>{employee.status}</Pill></td>
                    <td className="px-4 py-3">
                      <button className="font-semibold text-brand-700" onClick={() => onOpen(employee, "vacations")} type="button">{vacations.length} mov.</button>
                    </td>
                    <td className="px-4 py-3">
                      <button className="font-semibold text-brand-700" onClick={() => onOpen(employee, "payslips")} type="button">{payslips.length} PDF</button>
                    </td>
                    <td className="px-4 py-3">
                      <button className="font-semibold text-brand-700" onClick={() => onOpen(employee, "payments")} type="button">{payments.length} pagos</button>
                    </td>
                    <td className="px-4 py-3">
                      <Pill className={employee.paymentAlerts.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
                        {employee.paymentAlerts.length ? "Revisar" : "OK"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="inline-flex items-center gap-1 rounded-md border border-brand-700 px-2 py-1 text-xs font-semibold text-brand-700" onClick={() => onOpen(employee)} type="button"><Eye className="h-3.5 w-3.5" /> Ficha</button>
                        <button className="rounded-md border border-[#dfe4dd] px-2 py-1 text-xs font-semibold text-[#4e5a52]" onClick={() => onOpen(employee, "bank")} type="button">Banco</button>
                        <button className="rounded-md border border-[#dfe4dd] px-2 py-1 text-xs font-semibold text-[#4e5a52]" onClick={() => onOpen(employee, "novelties")} type="button">Novedad</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!employees.length ? (
                <tr><td className="px-4 py-8 text-center text-sm text-[#667068]" colSpan={10}>Sin trabajadores para los filtros actuales.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#dfe4dd] px-4 py-3 text-xs text-[#667068]">
          <span>{employees.length} trabajador(es)</span>
          <span>Paginacion visual preparada para Etapa 2</span>
        </div>
      </SectionCard>
    </div>
  );
}

function NewEmployeeForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
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
  );
}

function WorkerProfilePanel({
  data,
  employee,
  novelties,
  onClose,
  onSubmit,
  payslips,
  payments,
  saveNovelty,
  selectedTab,
  sendPayslips,
  setSelectedTab,
  submitJson,
  uploadPayslip,
  vacations
}: {
  data: HrDashboardData;
  employee: HrEmployee;
  novelties: HrDashboardData["monthlyNovelties"];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  payslips: HrDashboardData["payslips"];
  payments: HrDashboardData["paymentItems"];
  saveNovelty: (event: FormEvent<HTMLFormElement>) => void;
  selectedTab: WorkerTab;
  sendPayslips: (payslipIds: string[], resend?: boolean) => void;
  setSelectedTab: (value: WorkerTab) => void;
  submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void;
  uploadPayslip: (event: FormEvent<HTMLFormElement>) => void;
  vacations: HrDashboardData["vacations"];
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <aside className="ml-auto flex h-full w-full max-w-5xl flex-col bg-[#faf7f2] shadow-2xl">
        <header className="border-b border-[#dfe4dd] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-brand-900">{employee.fullName}</h2>
                <Pill className={statusClass(employee.status)}>{employee.status}</Pill>
                <Pill className={employee.paymentAlerts.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>{employee.paymentAlerts.length ? "Banco por revisar" : "Apto pago"}</Pill>
              </div>
              <p className="mt-1 text-sm text-[#667068]">{employee.rut} / {employee.position || "Sin cargo"} / {employee.area || "Sin area"}</p>
            </div>
            <button className="rounded-md border border-[#dfe4dd] p-2 text-[#4e5a52] hover:bg-brand-50" onClick={onClose} type="button"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {workerTabs.map((tab) => (
              <button className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold ${selectedTab === tab.id ? "bg-brand-700 text-white" : "border border-[#dfe4dd] bg-white text-[#4e5a52]"}`} key={tab.id} onClick={() => setSelectedTab(tab.id)} type="button">
                {tab.label}
              </button>
            ))}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {selectedTab === "personal" ? <EmployeePersonalTab employee={employee} onSubmit={onSubmit} /> : null}
          {selectedTab === "contract" ? <EmployeeContractTab employee={employee} onSubmit={onSubmit} /> : null}
          {selectedTab === "bank" ? <EmployeeBankTab employee={employee} onSubmit={onSubmit} /> : null}
          {selectedTab === "novelties" ? <EmployeeNoveltiesTab data={data} employee={employee} novelties={novelties} saveNovelty={saveNovelty} /> : null}
          {selectedTab === "vacations" ? <EmployeeVacationsTab data={data} employee={employee} submitJson={submitJson} vacations={vacations} /> : null}
          {selectedTab === "payslips" ? <EmployeePayslipsTab data={data} employee={employee} payslips={payslips} sendPayslips={sendPayslips} uploadPayslip={uploadPayslip} /> : null}
          {selectedTab === "payments" ? <EmployeePaymentsTab data={data} employee={employee} payments={payments} submitJson={submitJson} /> : null}
          {selectedTab === "documents" ? <EmployeeDocumentsTab /> : null}
          {selectedTab === "audit" ? <EmployeeAuditTab employee={employee} /> : null}
        </div>
      </aside>
    </div>
  );
}

function EmployeePersonalTab({ employee, onSubmit }: { employee: HrEmployee; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Datos personales</h3>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" defaultValue={employee.fullName} name="fullName" placeholder="Nombre" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.phone ?? ""} name="phone" placeholder="Telefono" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.personalEmail ?? ""} name="personalEmail" placeholder="Email personal" type="email" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.workEmail ?? ""} name="workEmail" placeholder="Email laboral" type="email" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.commune ?? ""} name="commune" placeholder="Comuna / ciudad" />
        <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" defaultValue={employee.address ?? ""} name="address" placeholder="Direccion" />
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">Guardar datos personales</button>
      </form>
    </SectionCard>
  );
}

function EmployeeContractTab({ employee, onSubmit }: { employee: HrEmployee; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Contrato</h3>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.position ?? ""} name="position" placeholder="Cargo" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.area ?? ""} name="area" placeholder="Area" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.costCenter ?? ""} name="costCenter" placeholder="Centro costo" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.baseSalary} name="salary" placeholder="Sueldo base" type="number" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.hireDate ?? ""} name="hireDate" type="date" />
        <select className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.status} name="status"><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="finiquitado">Finiquitado</option><option value="suspendido">Suspendido</option></select>
        <label className="flex items-center gap-2 text-sm"><input defaultChecked={employee.paymentEnabled} name="paymentEnabled" type="checkbox" /> Habilitar pagos</label>
        <input className="rounded-md border px-3 py-2 text-sm" name="reason" placeholder="Motivo cambio habilitacion" />
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">Guardar contrato</button>
      </form>
    </SectionCard>
  );
}

function EmployeeBankTab({ employee, onSubmit }: { employee: HrEmployee; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Banco</h3>
      <p className="mt-1 text-sm text-[#667068]">{employee.paymentAlerts.length ? `Faltan datos: ${employee.paymentAlerts.join(", ")}` : "Datos bancarios completos para pago."}</p>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.bankName ?? ""} name="bankName" placeholder="Banco" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.bankCode ?? ""} name="bankCode" placeholder="Codigo banco" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.accountType ?? ""} name="tipoCuenta" placeholder="Tipo cuenta" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.accountNumber ?? ""} name="bankAccount" placeholder="Numero cuenta" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.holderName ?? employee.fullName} name="titularCuenta" placeholder="Titular cuenta" />
        <input className="rounded-md border px-3 py-2 text-sm" defaultValue={employee.bankAccount?.holderRut ?? employee.rut} name="titularRut" placeholder="RUT titular" />
        <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" defaultValue={employee.bankAccount?.paymentEmail ?? employee.workEmail ?? employee.personalEmail ?? ""} name="emailPayment" placeholder="Email pago" type="email" />
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">Guardar banco</button>
      </form>
    </SectionCard>
  );
}

function EmployeeNoveltiesTab({ data, employee, novelties, saveNovelty }: { data: HrDashboardData; employee: HrEmployee; novelties: HrDashboardData["monthlyNovelties"]; saveNovelty: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Novedades mensuales</h3>
        <NoveltyForm data={data} employeeId={employee.id} onSubmit={saveNovelty} />
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <TableHeader title="Novedades del trabajador" />
        <SimpleTable headers={["Periodo", "Tipo", "Cantidad", "Horas", "Monto", "Estado"]}>
          {novelties.map((item) => (
            <tr className="border-t" key={item.id}><td className="px-4 py-3">{item.period}</td><td className="px-4 py-3">{item.type}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{item.hours}</td><td className="px-4 py-3">{formatClp(item.amount)}</td><td className="px-4 py-3">{item.status}</td></tr>
          ))}
        </SimpleTable>
      </SectionCard>
    </div>
  );
}

function EmployeeVacationsTab({ data, employee, submitJson, vacations }: { data: HrDashboardData; employee: HrEmployee; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void; vacations: HrDashboardData["vacations"] }) {
  const ledger = data.vacationLedger.filter((item) => item.employeeId === employee.id);
  const latestBalance = ledger[0]?.balanceAfter ?? vacations[0]?.resultingBalance ?? 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Vacaciones</h3>
        <div className="mt-3 grid gap-3 text-sm">
          <div className="rounded-md bg-brand-50 p-3"><p className="text-[#667068]">Saldo actual</p><p className="text-2xl font-semibold text-brand-900">{latestBalance} dias</p></div>
          <p className="text-[#667068]">Configuracion visible desde contrato actual. La configuracion avanzada queda para una etapa con schema dedicado.</p>
        </div>
        <VacationForm employeeId={employee.id} submitJson={submitJson} />
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <TableHeader title="Ledger vacaciones" />
        <SimpleTable headers={["Periodo", "Movimiento", "Dias", "Saldo"]}>
          {ledger.map((item) => <tr className="border-t" key={item.id}><td className="px-4 py-3">{item.period}</td><td className="px-4 py-3">{item.movementType}</td><td className="px-4 py-3">{item.days}</td><td className="px-4 py-3">{item.balanceAfter}</td></tr>)}
        </SimpleTable>
        <div className="border-t border-[#dfe4dd] p-4">
          <p className="mb-2 text-sm font-semibold text-brand-900">Comprobantes recientes</p>
          <div className="space-y-2">
            {vacations.map((vacation) => <a className="flex items-center justify-between rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-700" href={`/api/hr/vacations/${vacation.id}/papeleta`} key={vacation.id} target="_blank"><span>{vacation.startDate} al {vacation.endDate}</span><Download className="h-4 w-4" /></a>)}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function EmployeePayslipsTab({ data, employee, payslips, sendPayslips, uploadPayslip }: { data: HrDashboardData; employee: HrEmployee; payslips: HrDashboardData["payslips"]; sendPayslips: (payslipIds: string[], resend?: boolean) => void; uploadPayslip: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Cargar liquidacion</h3>
        <PayslipUploadForm data={data} employeeId={employee.id} onSubmit={uploadPayslip} />
      </SectionCard>
      <PayslipsTable payslips={payslips} sendPayslips={sendPayslips} />
    </div>
  );
}

function EmployeePaymentsTab({ data, employee, payments, submitJson }: { data: HrDashboardData; employee: HrEmployee; payments: HrDashboardData["paymentItems"]; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Crear pago</h3>
        <PaymentCreateForm data={data} employeeId={employee.id} submitJson={submitJson} />
      </SectionCard>
      <PaymentsMiniTable payments={payments} />
    </div>
  );
}

function EmployeeDocumentsTab() {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Documentos</h3>
      <p className="mt-2 text-sm text-[#667068]">Liquidaciones y comprobantes generados se administran en sus pestañas respectivas. Repositorio documental dedicado queda preparado para una etapa posterior sin tocar logica actual.</p>
    </SectionCard>
  );
}

function EmployeeAuditTab({ employee }: { employee: HrEmployee }) {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Auditoria</h3>
      <div className="mt-4 space-y-3 text-sm">
        {["Ficha trabajador disponible", "Pagos y liquidaciones auditados por endpoints RRHH", "Vacaciones y novedades registran eventos"].map((item) => (
          <div className="rounded-md border border-[#dfe4dd] bg-white px-3 py-2" key={item}>
            <p className="font-semibold text-brand-900">{item}</p>
            <p className="text-xs text-[#667068]">{employee.fullName}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PayrollSection({
  areas,
  data,
  employees,
  filteredPaymentItems,
  generatePayroll,
  markSelectedPaid,
  paymentAreaFilter,
  paymentPositionFilter,
  paymentSelection,
  paymentSort,
  positions,
  setPaymentAreaFilter,
  setPaymentPositionFilter,
  setPaymentSelection,
  setPaymentSort,
  submitJson
}: {
  areas: string[];
  data: HrDashboardData;
  employees: HrEmployee[];
  filteredPaymentItems: HrPaymentItem[];
  generatePayroll: () => void;
  markSelectedPaid: () => void;
  paymentAreaFilter: string;
  paymentPositionFilter: string;
  paymentSelection: string[];
  paymentSort: string;
  positions: string[];
  setPaymentAreaFilter: (value: string) => void;
  setPaymentPositionFilter: (value: string) => void;
  setPaymentSelection: React.Dispatch<React.SetStateAction<string[]>>;
  setPaymentSort: (value: string) => void;
  submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionCard className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">Nominas</h2>
            <p className="text-sm text-[#667068]">Seleccion multiple, exportacion banco y marcado de pagos desde una sola mesa de trabajo.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" onClick={generatePayroll} type="button">Exportar Template Pagos JESUS</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" onClick={markSelectedPaid} type="button"><CheckCircle2 className="h-4 w-4" /> Marcar pagadas</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <input className="rounded-md border px-3 py-2 text-sm" id="hr-tranche-label" placeholder="Nombre tramo" />
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" id="hr-glosa-global" placeholder="Glosa global nomina" />
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentAreaFilter(event.target.value)} value={paymentAreaFilter}><option value="">Todas las areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentPositionFilter(event.target.value)} value={paymentPositionFilter}><option value="">Todos los cargos</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentSort(event.target.value)} value={paymentSort}><option value="name">A-Z trabajador</option><option value="amount_desc">Mayor monto</option><option value="amount_asc">Menor monto</option><option value="status">Estado</option></select>
          <p className="text-xs font-semibold text-[#667068] lg:col-span-5">Exportar tramo banco desde Template Pagos JESUS RRHH.</p>
        </div>
      </SectionCard>
      <PaymentsTable employees={employees} items={filteredPaymentItems} selection={paymentSelection} setSelection={setPaymentSelection} />
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Pago manual RRHH</h3><PaymentCreateForm data={data} submitJson={submitJson} /></SectionCard>
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Anticipos avanzados</h3><AdvanceForm data={data} employees={employees} submitJson={submitJson} /></SectionCard>
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Finiquitos / Honorarios</h3><FiniquitoForm employees={employees} submitJson={submitJson} /><div className="my-4 border-t border-[#dfe4dd]" /><HonorarioForm data={data} submitJson={submitJson} /></SectionCard>
      </div>
    </div>
  );
}

function PaymentsTable({ employees, items, selection, setSelection }: { employees: HrEmployee[]; items: HrPaymentItem[]; selection: string[]; setSelection: React.Dispatch<React.SetStateAction<string[]>> }) {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  return (
    <SectionCard className="overflow-hidden">
      <TableHeader title="Pagos seleccionables" />
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-[#667068]"><tr><th className="px-4 py-3">Sel.</th><th className="px-4 py-3">Trabajador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Banco</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Glosa</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const employee = employeeById.get(item.employeeId);
              return (
                <tr className="border-t" key={item.id}>
                  <td className="px-4 py-3"><input checked={selection.includes(item.id)} onChange={() => setSelection((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} type="checkbox" /></td>
                  <td className="px-4 py-3 font-semibold text-brand-900">{employee?.fullName ?? item.employeeName}</td>
                  <td className="px-4 py-3">{item.paymentType}</td>
                  <td className="px-4 py-3">{item.period}</td>
                  <td className="px-4 py-3 font-semibold">{formatClp(item.amount)}</td>
                  <td className="px-4 py-3">{employee?.bankAccount?.bankName ?? "Sin banco"}</td>
                  <td className="px-4 py-3"><Pill className={statusClass(item.status)}>{item.status}</Pill></td>
                  <td className="px-4 py-3">{item.glosa ?? "Automatica"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function SalaryDataSection({ data, onSave }: { data: HrDashboardData; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h2 className="text-lg font-semibold text-brand-900">Datos Sueldos</h2>
        <p className="mt-1 text-sm text-[#667068]">Grilla operativa para el contador. El formulario actual queda concentrado como editor rapido de fila.</p>
        <AccountantRowForm data={data} onSubmit={onSave} />
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dfe4dd] p-4">
          <h3 className="font-semibold text-brand-900">Periodo {data.period}</h3>
          <a className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" href={`/api/hr/accountant-data?period=${data.period}`}>Exportar Excel contador</a>
        </div>
        <SimpleTable headers={["Trabajador", "RUT", "HE", "Lic.", "Inas.", "Bonos", "Anticipos", "Obs."]}>
          {data.accountantRows.map((row) => (
            <tr className="border-t" key={row.id}>
              <td className="px-4 py-3 font-semibold">{row.fullName}</td><td className="px-4 py-3">{row.rut}</td><td className="px-4 py-3">{row.overtimeHours}</td><td className="px-4 py-3">{row.licenses}</td><td className="px-4 py-3">{row.absences}</td><td className="px-4 py-3">{formatClp(row.productionBonus + row.compensatoryBonus + row.responsibilityBonus + row.aguinaldo)}</td><td className="px-4 py-3">{formatClp(row.advances)}</td><td className="px-4 py-3">{row.observations}</td>
            </tr>
          ))}
        </SimpleTable>
      </SectionCard>
    </div>
  );
}

function PayslipsSection({ data, employees, sendPayslips, uploadPayslip }: { data: HrDashboardData; employees: HrEmployee[]; sendPayslips: (payslipIds: string[], resend?: boolean) => void; uploadPayslip: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <SectionCard className="p-5">
        <h2 className="text-lg font-semibold text-brand-900">Liquidaciones</h2>
        <PayslipUploadForm data={data} employees={employees} onSubmit={uploadPayslip} />
        <button className="mt-4 w-full rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={() => sendPayslips(data.payslips.map((payslip) => payslip.id))} type="button">Enviar liquidaciones pendientes pagadas</button>
      </SectionCard>
      <PayslipsTable payslips={data.payslips} sendPayslips={sendPayslips} />
    </div>
  );
}

function ImportsSection({ importBankAccounts, importPayroll }: { importBankAccounts: (event: FormEvent<HTMLFormElement>) => void; importPayroll: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <SectionCard className="p-5">
      <h2 className="text-lg font-semibold text-brand-900">Asistente de importacion</h2>
      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <ImportStep number="1" title="Liquidaciones y Datos Sueldos">
          <form className="space-y-3" onSubmit={importPayroll}>
            <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue="2026-04" name="period" type="month" />
            <input accept="application/pdf" className="w-full rounded-md border px-3 py-2 text-sm" name="payslipsPdf" required type="file" />
            <input accept=".xlsx" className="w-full rounded-md border px-3 py-2 text-sm" name="salaryDataXlsx" type="file" />
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit"><Upload className="h-4 w-4" /> Importar</button>
          </form>
        </ImportStep>
        <ImportStep number="2" title="Datos bancarios">
          <form className="space-y-3" onSubmit={importBankAccounts}>
            <input accept=".xls,.xlsx" className="w-full rounded-md border px-3 py-2 text-sm" name="bankFile" required type="file" />
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" type="submit"><Upload className="h-4 w-4" /> Importar bancos</button>
          </form>
        </ImportStep>
        <ImportStep number="3" title="Validacion">
          <p className="text-sm text-[#667068]">Los endpoints actuales reportan importados, actualizados, advertencias y sin match.</p>
        </ImportStep>
        <ImportStep number="4" title="Resumen">
          <p className="text-sm text-[#667068]">El resultado aparece en la banda de mensajes superior para mantener la logica existente.</p>
        </ImportStep>
      </div>
    </SectionCard>
  );
}

function DashboardSection({ kpis }: { kpis: Array<{ icon: typeof Users; label: string; sub: string; value: string }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {kpis.map((item) => {
        const Icon = item.icon;
        return (
          <SectionCard className="p-5" key={item.label}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#667068]">{item.label}</p>
              <Icon className="h-5 w-5 text-brand-700" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-brand-900">{item.value}</p>
            <p className="mt-1 text-xs text-[#667068]">{item.sub}</p>
          </SectionCard>
        );
      })}
    </div>
  );
}

function ImportStep({ children, number, title }: { children: React.ReactNode; number: string; title: string }) {
  return (
    <div className="rounded-lg border border-[#dfe4dd] bg-brand-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{number}</span>
        <h3 className="font-semibold text-brand-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function NoveltyForm({ data, employeeId, onSubmit }: { data: HrDashboardData; employeeId?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
      {employeeId ? <input name="employeeId" type="hidden" value={employeeId} /> : <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" name="employeeId">{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>}
      <input className="rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
      <select className="rounded-md border px-3 py-2 text-sm" name="type">
        <option value="inasistencia">Inasistencia</option><option value="licencia">Licencia</option><option value="horas_extras">Horas extras</option><option value="recargo_domingo">Recargo domingo</option><option value="bono_compensatorio">Bono compensatorio</option><option value="bono_produccion">Bono produccion</option><option value="bono_responsabilidad">Bono responsabilidad</option><option value="aguinaldo">Aguinaldo</option><option value="anticipo">Anticipo</option><option value="prestamo_empresa">Prestamo empresa</option><option value="prestamo_ccaf">Prestamo caja / CCAF</option><option value="honorarios">Honorarios</option><option value="finiquito">Finiquito</option><option value="descuento">Descuento</option><option value="observacion">Observacion</option>
      </select>
      <input className="rounded-md border px-3 py-2 text-sm" name="quantity" placeholder="Cantidad" type="number" step="0.01" />
      <input className="rounded-md border px-3 py-2 text-sm" name="hours" placeholder="Horas" type="number" step="0.01" />
      <input className="rounded-md border px-3 py-2 text-sm" name="amount" placeholder="Monto" type="number" />
      <select className="rounded-md border px-3 py-2 text-sm" name="status"><option value="confirmada">Confirmada</option><option value="borrador">Borrador</option><option value="anulada">Anulada</option></select>
      <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" name="notes" placeholder="Observaciones" />
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">Guardar novedad</button>
    </form>
  );
}

function AccountantRowForm({ data, onSubmit }: { data: HrDashboardData; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
      <input className="rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
      <input className="rounded-md border px-3 py-2 text-sm" name="rut" placeholder="RUT" required />
      <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" name="fullName" placeholder="Trabajador" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="costCenter" placeholder="C. costo" />
      <input className="rounded-md border px-3 py-2 text-sm" name="absences" placeholder="Inasistencias" type="number" step="0.01" />
      <input className="rounded-md border px-3 py-2 text-sm" name="licenses" placeholder="Licencias" type="number" step="0.01" />
      <input className="rounded-md border px-3 py-2 text-sm" name="overtimeHours" placeholder="Horas extras" type="number" step="0.01" />
      <input className="rounded-md border px-3 py-2 text-sm" name="productionBonus" placeholder="Bono produccion" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="compensatoryBonus" placeholder="Bono compensatorio" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="responsibilityBonus" placeholder="Bono responsabilidad" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="aguinaldo" placeholder="Aguinaldo" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="advances" placeholder="Anticipos" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="companyLoan" placeholder="Prestamo empresa" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm" name="ccafLoan" placeholder="Prestamo caja" type="number" />
      <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" name="observations" placeholder="Observaciones" />
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">Guardar fila</button>
    </form>
  );
}

function VacationForm({ employeeId, submitJson }: { employeeId: string; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <>
      <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations", "Vacaciones registradas.")}>
        <input name="employeeId" type="hidden" value={employeeId} />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="documentDate" type="date" defaultValue={today()} />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="contractPeriodStart" type="date" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="contractPeriodEnd" type="date" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="startDate" type="date" required />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="endDate" type="date" required />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="progressiveDays" placeholder="Vacaciones progresivas" type="number" step="0.01" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="nonBusinessDays" placeholder="Domingos e inhabiles" type="number" step="0.01" />
        <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="solicitada">Solicitada</option><option value="aprobada">Aprobada</option><option value="tomada">Tomada</option><option value="rechazada">Rechazada</option></select>
        <label className="flex items-center gap-2 text-sm"><input name="fractionalVacation" type="checkbox" /> Feriado fraccionado</label>
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="observation" placeholder="Observacion" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="note" placeholder="Nota comprobante" />
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Registrar vacaciones</button>
      </form>
      <form className="mt-4 border-t border-[#dfe4dd] pt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations/accruals", "Movimiento de vacaciones registrado.")}>
        <input name="employeeId" type="hidden" value={employeeId} />
        <p className="text-sm font-semibold text-brand-900">Acumulacion / ajuste</p>
        <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={monthToday()} name="period" type="month" />
        <select className="w-full rounded-md border px-3 py-2 text-sm" name="movementType"><option value="acumulacion_mensual">Acumulacion mensual</option><option value="saldo_inicial">Saldo inicial</option><option value="ajuste_manual">Ajuste manual</option><option value="vacaciones_tomadas">Vacaciones tomadas</option><option value="finiquito">Finiquito</option></select>
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="days" placeholder="Dias (+/-)" type="number" step="0.01" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="note" placeholder="Motivo auditoria" />
        <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" type="submit">Guardar movimiento</button>
      </form>
    </>
  );
}

function PayslipUploadForm({ data, employeeId, employees, onSubmit }: { data: HrDashboardData; employeeId?: string; employees?: HrEmployee[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      {employeeId ? <input name="employeeId" type="hidden" value={employeeId} /> : <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{(employees ?? data.employees).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>}
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="netAmount" placeholder="Monto liquido" type="number" />
      <input accept="application/pdf" className="w-full rounded-md border px-3 py-2 text-sm" name="file" required type="file" />
      <button className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit"><Upload className="h-4 w-4" /> Cargar PDF</button>
    </form>
  );
}

function PaymentCreateForm({ data, employeeId, submitJson }: { data: HrDashboardData; employeeId?: string; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/payments", "Pago RRHH creado.")}>
      {employeeId ? <input name="employeeId" type="hidden" value={employeeId} /> : <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>}
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={monthToday()} name="period" type="month" />
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="paymentType"><option value="remuneracion_mensual">Remuneracion mensual</option><option value="anticipo">Anticipo</option><option value="honorarios">Honorarios</option><option value="finiquito">Finiquito</option><option value="bono_compensatorio">Bono compensatorio</option><option value="bono_extra">Bono extra</option><option value="aguinaldo">Aguinaldo</option><option value="compensacion">Compensacion</option><option value="otro">Otro</option></select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="amount" placeholder="Monto" required type="number" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="glosa" placeholder="Glosa individual" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="scheduledDate" type="date" />
      <input name="status" type="hidden" value="aprobado" />
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Crear pago aprobado</button>
    </form>
  );
}

function AdvanceForm({ data, employees, submitJson }: { data: HrDashboardData; employees: HrEmployee[]; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/advances", "Anticipo registrado.")}>
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={today()} name="requestDate" type="date" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="requestedAmount" placeholder="Monto solicitado" type="number" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="approvedAmount" placeholder="Monto aprobado" type="number" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="discountPeriod" type="month" />
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="solicitado">Solicitado</option><option value="aprobado">Aprobado</option><option value="pagado">Pagado</option><option value="descontado">Descontado</option><option value="rechazado">Rechazado</option></select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="reason" placeholder="Motivo" />
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Guardar anticipo</button>
    </form>
  );
}

function FiniquitoForm({ employees, submitJson }: { employees: HrEmployee[]; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/finiquitos", "Finiquito registrado.")}>
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="terminationDate" type="date" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="causal" placeholder="Causal termino" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="settlementAmount" placeholder="Monto finiquito" type="number" />
      <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="pendiente_pago">Pendiente pago</option><option value="aprobado">Aprobado</option><option value="pagado">Pagado</option><option value="anulado">Anulado</option></select>
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Generar finiquito</button>
    </form>
  );
}

function HonorarioForm({ data, submitJson }: { data: HrDashboardData; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void }) {
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/honorarios", "Honorario creado para pago.")}>
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="fullName" placeholder="Nombre" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="rut" placeholder="RUT" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="amount" placeholder="Monto" type="number" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="bankName" placeholder="Banco" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="bankCode" placeholder="Codigo banco" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="accountType" placeholder="Tipo cuenta" />
      <input className="w-full rounded-md border px-3 py-2 text-sm" name="accountNumber" placeholder="Numero cuenta" />
      <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Crear honorario</button>
    </form>
  );
}

function PayslipsTable({ payslips, sendPayslips }: { payslips: HrDashboardData["payslips"]; sendPayslips: (payslipIds: string[], resend?: boolean) => void }) {
  return (
    <SectionCard className="overflow-hidden">
      <TableHeader title="Bandeja liquidaciones" />
      <SimpleTable headers={["Trabajador", "Periodo", "PDF", "Liquido", "Estado", "Envio", "Acciones"]}>
        {payslips.map((payslip) => (
          <tr className="border-t" key={payslip.id}>
            <td className="px-4 py-3 font-semibold">{payslip.employeeName}</td><td className="px-4 py-3">{payslip.period}</td><td className="px-4 py-3">{payslip.originalFilename}</td><td className="px-4 py-3">{formatClp(payslip.netAmount)}</td><td className="px-4 py-3">{payslip.status}</td><td className="px-4 py-3">{payslip.sendStatus}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><a className="rounded-md border px-2 py-1 text-xs font-semibold text-brand-700" href={`/api/hr/payslips/${payslip.id}/download`}>Descargar</a><button className="rounded-md border px-2 py-1 text-xs font-semibold text-brand-700" onClick={() => sendPayslips([payslip.id])} type="button">Enviar</button><button className="rounded-md border px-2 py-1 text-xs font-semibold text-brand-700" onClick={() => sendPayslips([payslip.id], true)} type="button">Reenviar</button></div></td>
          </tr>
        ))}
      </SimpleTable>
    </SectionCard>
  );
}

function PaymentsMiniTable({ payments }: { payments: HrDashboardData["paymentItems"] }) {
  return (
    <SectionCard className="overflow-hidden">
      <TableHeader title="Pagos del trabajador" />
      <SimpleTable headers={["Periodo", "Tipo", "Monto", "Estado", "Glosa"]}>
        {payments.map((item) => <tr className="border-t" key={item.id}><td className="px-4 py-3">{item.period}</td><td className="px-4 py-3">{item.paymentType}</td><td className="px-4 py-3">{formatClp(item.amount)}</td><td className="px-4 py-3"><Pill className={statusClass(item.status)}>{item.status}</Pill></td><td className="px-4 py-3">{item.glosa}</td></tr>)}
      </SimpleTable>
    </SectionCard>
  );
}

function TableHeader({ title }: { title: string }) {
  return <div className="flex items-center gap-2 border-b border-[#dfe4dd] bg-white p-4"><SlidersHorizontal className="h-4 w-4 text-brand-700" /><h3 className="font-semibold text-brand-900">{title}</h3></div>;
}

function SimpleTable({ children, headers }: { children: React.ReactNode; headers: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase text-[#667068]"><tr>{headers.map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
