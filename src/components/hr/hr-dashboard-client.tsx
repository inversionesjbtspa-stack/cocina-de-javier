"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { buildSalaryRows, salaryRowHasNovelty } from "@/lib/hr/salary-data";

type HrSection = "workers" | "payroll" | "salary" | "payslips" | "imports" | "dashboard";
type WorkerTab = "personal" | "contract" | "bank" | "novelties" | "vacations" | "payslips" | "payments" | "documents" | "audit";
type WorkerSort = "name" | "status" | "area" | "vacations" | "payments";
type WorkerColumn = "fullName" | "rut" | "position" | "area" | "status" | "vacations" | "payslips" | "payments" | "bank";
type HrPaymentItem = HrDashboardData["paymentItems"][number];

const paymentConcepts = [
  ["remuneracion_mensual", "Remuneracion mensual", false],
  ["anticipo", "Anticipo", false],
  ["aguinaldo", "Aguinaldo", false],
  ["anticipo_aguinaldo", "Anticipo de aguinaldo", false],
  ["bono_produccion", "Bono de produccion", false],
  ["bono_compensatorio", "Bono compensatorio", false],
  ["bono_responsabilidad", "Bono de responsabilidad", false],
  ["recargo_domingo", "Recargo domingo", false],
  ["movilizacion", "Movilizacion", false],
  ["asignacion_telefono", "Asignacion telefono", false],
  ["prestamo_empresa", "Prestamo empresa", false],
  ["prestamo_caja", "Prestamo caja", false],
  ["finiquito", "Finiquito", false],
  ["honorario", "Honorario", false],
  ["reembolso", "Reembolso", false],
  ["otro_bono", "Otro bono", true],
  ["otro_concepto", "Otro concepto", true]
] as const;

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
  const [workerColumnFilters, setWorkerColumnFilters] = useState<Record<WorkerColumn, string>>({
    area: "",
    bank: "",
    fullName: "",
    payments: "",
    payslips: "",
    position: "",
    rut: "",
    status: "",
    vacations: ""
  });
  const [workerColumnSort, setWorkerColumnSort] = useState<{ column: WorkerColumn; direction: "asc" | "desc" }>({ column: "fullName", direction: "asc" });
  const [payrollDraft, setPayrollDraft] = useState<Record<string, { amount: string; glosa: string }>>({});
  const [payrollSearch, setPayrollSearch] = useState("");
  const [paymentBankFilter, setPaymentBankFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [bulkPayslipPreview, setBulkPayslipPreview] = useState<Array<Record<string, string | number | boolean | null>>>([]);
  const [bulkPayslipSummary, setBulkPayslipSummary] = useState<Record<string, number> | null>(null);
  const [bulkPayslipAssignments, setBulkPayslipAssignments] = useState<Record<string, string>>({});
  const [paymentSelection, setPaymentSelection] = useState<string[]>([]);
  const [payrollEmployeeSelection, setPayrollEmployeeSelection] = useState<string[]>([]);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setWorkerSearch(params.get("q") ?? "");
    setWorkerStatusFilter(params.get("status") ?? "");
    setWorkerAreaFilter(params.get("area") ?? "");
    const columnFilters = params.get("workerFilters");
    if (columnFilters) {
      try {
        setWorkerColumnFilters((current) => ({ ...current, ...JSON.parse(columnFilters) }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (workerSearch) params.set("q", workerSearch); else params.delete("q");
    if (workerStatusFilter) params.set("status", workerStatusFilter); else params.delete("status");
    if (workerAreaFilter) params.set("area", workerAreaFilter); else params.delete("area");
    const activeColumnFilters = Object.fromEntries(Object.entries(workerColumnFilters).filter(([, value]) => value));
    if (Object.keys(activeColumnFilters).length) params.set("workerFilters", JSON.stringify(activeColumnFilters)); else params.delete("workerFilters");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }, [workerAreaFilter, workerColumnFilters, workerSearch, workerStatusFilter]);

  const filteredEmployees = (() => {
    const search = workerSearch.trim().toLowerCase();
    return employees
      .filter((employee) => {
        const searchable = `${employee.fullName} ${employee.rut} ${employee.position ?? ""} ${employee.area ?? ""}`.toLowerCase();
        const vacations = vacationsFor(employee.id).length;
        const payslips = payslipsFor(employee.id).length;
        const payments = paymentsFor(employee.id).length;
        const bank = employee.paymentAlerts.length ? "revisar incompleto pendiente" : "ok completo validado";
        return (!search || searchable.includes(search))
          && (!workerStatusFilter || employee.status === workerStatusFilter)
          && (!workerAreaFilter || employee.area === workerAreaFilter)
          && (!workerColumnFilters.fullName || employee.fullName.toLowerCase().includes(workerColumnFilters.fullName.toLowerCase()))
          && (!workerColumnFilters.rut || employee.rut.toLowerCase().includes(workerColumnFilters.rut.toLowerCase()))
          && (!workerColumnFilters.position || (employee.position ?? "").toLowerCase().includes(workerColumnFilters.position.toLowerCase()))
          && (!workerColumnFilters.area || (employee.area ?? "").toLowerCase().includes(workerColumnFilters.area.toLowerCase()))
          && (!workerColumnFilters.status || employee.status.toLowerCase().includes(workerColumnFilters.status.toLowerCase()))
          && (!workerColumnFilters.vacations || String(vacations).includes(workerColumnFilters.vacations))
          && (!workerColumnFilters.payslips || String(payslips).includes(workerColumnFilters.payslips))
          && (!workerColumnFilters.payments || String(payments).includes(workerColumnFilters.payments))
          && (!workerColumnFilters.bank || bank.includes(workerColumnFilters.bank.toLowerCase()));
      })
      .sort((a, b) => {
        const direction = workerColumnSort.direction === "asc" ? 1 : -1;
        const value = (employee: HrEmployee) => {
          if (workerColumnSort.column === "vacations") return vacationsFor(employee.id).length;
          if (workerColumnSort.column === "payslips") return payslipsFor(employee.id).length;
          if (workerColumnSort.column === "payments") return paymentsFor(employee.id).length;
          if (workerColumnSort.column === "bank") return employee.paymentAlerts.length ? "revisar" : "ok";
          return String(employee[workerColumnSort.column] ?? "");
        };
        const left = value(a);
        const right = value(b);
        if (typeof left === "number" && typeof right === "number" && left !== right) return (left - right) * direction;
        const columnResult = String(left).localeCompare(String(right));
        if (columnResult) return columnResult * direction;
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

  const selectablePayrollEmployees = useMemo(() => employees
    .filter((employee) => employee.status === "activo")
    .filter((employee) => {
      const search = payrollSearch.trim().toLowerCase();
      const bankStatus = employee.paymentAlerts.length ? "incompleto" : "completo";
      return (!search || `${employee.fullName} ${employee.rut}`.toLowerCase().includes(search))
        && (!paymentAreaFilter || employee.area === paymentAreaFilter)
        && (!paymentPositionFilter || employee.position === paymentPositionFilter)
        && (!paymentBankFilter || bankStatus === paymentBankFilter)
        && (!paymentStatusFilter || (paymentStatusFilter === "habilitado" ? employee.paymentEnabled : !employee.paymentEnabled));
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName)), [employees, paymentAreaFilter, paymentBankFilter, paymentPositionFilter, paymentStatusFilter, payrollSearch]);

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

  async function createSelectablePayrollBatch(config: { concept: string; conceptDescription: string; glosaGlobal: string; period: string; scheduledDate: string; status: "borrador" | "pendiente_pago" | "aprobado" }) {
    const items = payrollEmployeeSelection.map((employeeId) => ({
      amount: Number(payrollDraft[employeeId]?.amount ?? 0),
      employeeId,
      glosa: payrollDraft[employeeId]?.glosa ?? ""
    })).filter((item) => item.amount > 0);
    if (!items.length) {
      setMessage("Selecciona trabajadores e ingresa montos mayores a cero.");
      return;
    }
    const concept = paymentConcepts.find(([code]) => code === config.concept);
    if (concept?.[2] && !config.conceptDescription.trim()) {
      setMessage("El concepto seleccionado requiere descripcion.");
      return;
    }
    const response = await fetch("/api/hr/payments/batch", {
      body: JSON.stringify({
        conceptDescription: config.conceptDescription,
        glosaGlobal: config.glosaGlobal,
        items,
        paymentType: config.concept,
        period: config.period,
        scheduledDate: config.scheduledDate,
        status: config.status
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 409) {
      const confirmDuplicate = window.confirm(`Existen ${payload?.duplicates?.length ?? 0} pago(s) del mismo concepto y periodo. Deseas crear igualmente el lote?`);
      if (confirmDuplicate) {
        const retry = await fetch("/api/hr/payments/batch", {
          body: JSON.stringify({ conceptDescription: config.conceptDescription, confirmDuplicates: true, glosaGlobal: config.glosaGlobal, items, paymentType: config.concept, period: config.period, scheduledDate: config.scheduledDate, status: config.status }),
          headers: { "content-type": "application/json" },
          method: "POST"
        });
        const retryPayload = await retry.json().catch(() => null);
        setMessage(retry.ok ? `Lote creado: ${retryPayload.created} pago(s).` : retryPayload?.error ?? "No se pudo crear el lote.");
      }
      return;
    }
    setMessage(response.ok ? `Lote creado: ${payload.created} pago(s).` : payload?.error ?? "No se pudo crear el lote.");
  }

  async function previewBulkPayslips(event: FormEvent<HTMLFormElement>, commit = false) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("mode", commit ? "commit" : "preview");
    body.set("assignments", JSON.stringify(bulkPayslipAssignments));
    const response = await fetch("/api/hr/payslips/bulk", { body, method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (payload?.unresolved?.length) setBulkPayslipPreview(payload.results ?? []);
      setMessage(payload?.error ?? "No se pudo clasificar carga masiva.");
      return;
    }
    setBulkPayslipPreview(payload.results ?? []);
    setBulkPayslipSummary(payload.summary ?? null);
    setMessage(commit ? `Carga confirmada: ${payload.saved ?? 0} liquidacion(es) guardadas.` : `Previsualizacion lista: ${payload.summary?.autoMatched ?? 0} automaticas, ${payload.summary?.needsReview ?? 0} a revision.`);
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

  async function cancelVacationRequest(id: string) {
    const reason = window.prompt("Motivo de anulacion de la solicitud de vacaciones") ?? "";
    if (!window.confirm("Anular esta solicitud sin eliminar su historial?")) return;
    const response = await fetch(`/api/hr/vacations/${id}`, {
      body: JSON.stringify({ reason, status: "anulada" }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    const payload = await response.json().catch(() => null);
    setMessage(response.ok ? "Solicitud de vacaciones anulada y auditada." : payload?.error ?? "No se pudo anular la solicitud.");
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
          columnFilters={workerColumnFilters}
          columnSort={workerColumnSort}
          setColumnFilters={setWorkerColumnFilters}
          setColumnSort={setWorkerColumnSort}
          clearFilters={() => {
            setWorkerSearch("");
            setWorkerStatusFilter("");
            setWorkerAreaFilter("");
            setWorkerColumnFilters({ area: "", bank: "", fullName: "", payments: "", payslips: "", position: "", rut: "", status: "", vacations: "" });
          }}
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
          payrollEmployeeSelection={payrollEmployeeSelection}
          paymentPositionFilter={paymentPositionFilter}
          paymentSelection={paymentSelection}
          paymentSort={paymentSort}
          payrollDraft={payrollDraft}
          payrollSearch={payrollSearch}
          positions={positions}
          selectableEmployees={selectablePayrollEmployees}
          setPaymentBankFilter={setPaymentBankFilter}
          setPaymentAreaFilter={setPaymentAreaFilter}
          setPayrollEmployeeSelection={setPayrollEmployeeSelection}
          setPaymentPositionFilter={setPaymentPositionFilter}
          setPaymentSelection={setPaymentSelection}
          setPaymentSort={setPaymentSort}
          setPaymentStatusFilter={setPaymentStatusFilter}
          setPayrollDraft={setPayrollDraft}
          setPayrollSearch={setPayrollSearch}
          submitJson={submitJson}
          createSelectablePayrollBatch={createSelectablePayrollBatch}
          paymentBankFilter={paymentBankFilter}
          paymentStatusFilter={paymentStatusFilter}
        />
      ) : null}

      {activeSection === "salary" ? <SalaryDataSection data={data} onSave={saveAccountantRow} setMessage={setMessage} /> : null}
      {activeSection === "payslips" ? <PayslipsSection bulkPayslipAssignments={bulkPayslipAssignments} bulkPayslipPreview={bulkPayslipPreview} bulkPayslipSummary={bulkPayslipSummary} data={data} employees={employees} previewBulkPayslips={previewBulkPayslips} sendPayslips={sendPayslips} setBulkPayslipAssignments={setBulkPayslipAssignments} uploadPayslip={uploadPayslip} /> : null}
      {activeSection === "imports" ? <ImportsSection importBankAccounts={importBankAccounts} importPayroll={importPayroll} /> : null}
      {activeSection === "dashboard" ? <DashboardSection kpis={kpis} /> : null}

      {profileOpen && selectedEmployee ? (
        <WorkerProfilePanel
          cancelVacationRequest={cancelVacationRequest}
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
  clearFilters,
  columnFilters,
  columnSort,
  employees,
  onCreate,
  onOpen,
  paymentsFor,
  payslipsFor,
  search,
  setArea,
  setColumnFilters,
  setColumnSort,
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
  clearFilters: () => void;
  columnFilters: Record<WorkerColumn, string>;
  columnSort: { column: WorkerColumn; direction: "asc" | "desc" };
  employees: HrEmployee[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onOpen: (employee: HrEmployee, tab?: WorkerTab) => void;
  paymentsFor: (employeeId: string) => HrDashboardData["paymentItems"];
  payslipsFor: (employeeId: string) => HrDashboardData["payslips"];
  search: string;
  setArea: (value: string) => void;
  setColumnFilters: React.Dispatch<React.SetStateAction<Record<WorkerColumn, string>>>;
  setColumnSort: React.Dispatch<React.SetStateAction<{ column: WorkerColumn; direction: "asc" | "desc" }>>;
  setSearch: (value: string) => void;
  setSort: (value: WorkerSort) => void;
  setStatus: (value: string) => void;
  sort: WorkerSort;
  status: string;
  statuses: string[];
  vacationsFor: (employeeId: string) => HrDashboardData["vacations"];
}) {
  const header = (label: string, column: WorkerColumn, placeholder = "Filtrar") => (
    <div className="space-y-2">
      <button
        className="flex w-full items-center justify-between gap-2 text-left font-semibold"
        onClick={() => setColumnSort((current) => ({ column, direction: current.column === column && current.direction === "asc" ? "desc" : "asc" }))}
        type="button"
      >
        <span>{label}</span>
        <span>{columnSort.column === column ? (columnSort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
      <div className="flex gap-1">
        <input
          className="w-full rounded border border-[#dfe4dd] bg-white px-2 py-1 text-[11px] normal-case text-brand-900"
          onChange={(event) => setColumnFilters((current) => ({ ...current, [column]: event.target.value }))}
          placeholder={placeholder}
          value={columnFilters[column]}
        />
        {columnFilters[column] ? <button className="rounded border border-[#dfe4dd] px-1 text-[11px]" onClick={() => setColumnFilters((current) => ({ ...current, [column]: "" }))} type="button">x</button> : null}
      </div>
    </div>
  );
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
          <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 lg:col-span-4" onClick={clearFilters} type="button">Limpiar filtros</button>
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-[#dfe4dd] bg-brand-50 text-xs uppercase text-[#667068]">
              <tr>
                <th className="px-4 py-3">{header("Nombre", "fullName", "Nombre")}</th>
                <th className="px-4 py-3">{header("RUT", "rut", "RUT")}</th>
                <th className="px-4 py-3">{header("Cargo", "position", "Cargo")}</th>
                <th className="px-4 py-3">{header("Area", "area", "Area")}</th>
                <th className="px-4 py-3">{header("Estado", "status", "Estado")}</th>
                <th className="px-4 py-3">{header("Vacaciones", "vacations", "N")}</th>
                <th className="px-4 py-3">{header("Liquidaciones", "payslips", "N")}</th>
                <th className="px-4 py-3">{header("Pagos", "payments", "N")}</th>
                <th className="px-4 py-3">{header("Banco", "bank", "OK/Revisar")}</th>
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
  cancelVacationRequest,
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
  cancelVacationRequest: (id: string) => void;
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
          {selectedTab === "vacations" ? <EmployeeVacationsTab cancelVacationRequest={cancelVacationRequest} data={data} employee={employee} submitJson={submitJson} vacations={vacations} /> : null}
          {selectedTab === "payslips" ? <EmployeePayslipsTab data={data} employee={employee} payslips={payslips} sendPayslips={sendPayslips} uploadPayslip={uploadPayslip} /> : null}
          {selectedTab === "payments" ? <EmployeePaymentsTab data={data} employee={employee} payments={payments} submitJson={submitJson} /> : null}
          {selectedTab === "documents" ? <EmployeeDocumentsTab employee={employee} payslips={payslips} /> : null}
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

function EmployeeVacationsTab({ cancelVacationRequest, data, employee, submitJson, vacations }: { cancelVacationRequest: (id: string) => void; data: HrDashboardData; employee: HrEmployee; submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void; vacations: HrDashboardData["vacations"] }) {
  const ledger = data.vacationLedger.filter((item) => item.employeeId === employee.id);
  const periods = data.vacationPeriods.filter((item) => item.employeeId === employee.id);
  const earnedBalance = periods.reduce((sum, period) => sum + period.availableBalance, 0);
  const reservedDays = periods.reduce((sum, period) => sum + period.reservedDays, 0);
  const advanceDays = periods.reduce((sum, period) => sum + period.advanceDays, 0);
  const progressiveDays = periods.reduce((sum, period) => sum + period.progressiveDays, 0);
  const projectedProportional = periods[0] ? ((periods[0].baseDays + periods[0].progressiveDays) / 12) : 1.25;
  const latestBalance = periods.length ? earnedBalance : ledger[0]?.balanceAfter ?? vacations[0]?.resultingBalance ?? 0;
  async function action(id: string, endpoint: string, body: Record<string, unknown> = {}) {
    const response = await fetch(`/api/hr/vacations/${id}/${endpoint}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    window.alert(response.ok ? "Accion registrada." : payload?.error ?? "No se pudo completar la accion.");
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Vacaciones</h3>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <MetricTile label="Saldo devengado" value={`${latestBalance.toFixed(2)} dias`} />
          <MetricTile label="Proporcional proyectado" value={`${projectedProportional.toFixed(6)} / mes`} />
          <MetricTile label="Reservados" value={`${reservedDays.toFixed(2)} dias`} />
          <MetricTile label="Anticipados" value={`${advanceDays.toFixed(2)} dias`} />
          <MetricTile label="Progresivos" value={`${progressiveDays.toFixed(2)} dias`} />
          <MetricTile label="Proxima anualidad" value={employee.hireDate ? employee.hireDate.slice(5) : "Requiere ingreso"} />
        </div>
        <p className="mt-3 text-xs text-[#667068]">El proporcional proyectado es informativo y no se suma al saldo utilizable salvo autorizacion explicita de vacaciones anticipadas.</p>
        <VacationForm employeeId={employee.id} submitJson={submitJson} />
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <TableHeader action={<a className="rounded-md border border-brand-700 px-3 py-1.5 text-xs font-semibold text-brand-700" href="/api/hr/vacations/export" target="_blank">Exportar resumen</a>} title="Detalle por periodo" />
        <SimpleTable headers={["Periodo", "Base", "Prog.", "Usados", "Reserv.", "Antic.", "Saldo", "Bloque"]}>
          {periods.map((period) => (
            <tr className="border-t" key={period.id}>
              <td className="px-4 py-3">{period.periodStart} / {period.periodEnd}</td>
              <td className="px-4 py-3">{period.baseDays}</td>
              <td className="px-4 py-3">{period.progressiveDays}</td>
              <td className="px-4 py-3">{period.usedDays}</td>
              <td className="px-4 py-3">{period.reservedDays}</td>
              <td className="px-4 py-3">{period.advanceDays}</td>
              <td className="px-4 py-3">{period.availableBalance}</td>
              <td className="px-4 py-3">{period.continuousBlockUsed}/{period.continuousBlockRequired}</td>
            </tr>
          ))}
          {!periods.length ? <tr><td className="px-4 py-4 text-sm text-[#667068]" colSpan={8}>Sin periodos contractuales persistidos. Se usara vista previa calculada desde fecha de ingreso hasta aplicar migracion.</td></tr> : null}
        </SimpleTable>
        <div className="border-t border-[#dfe4dd] p-4">
          <p className="mb-2 text-sm font-semibold text-brand-900">Comprobantes recientes</p>
          <div className="space-y-2">
            {vacations.map((vacation) => (
              <div className="rounded-md border border-[#dfe4dd] bg-white p-3 text-sm" key={vacation.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-900">{vacation.startDate} al {vacation.endDate}</p>
                    <p className="text-xs text-[#667068]">Estado {vacation.status} / {vacation.businessDays} dias habiles / saldo {vacation.resultingBalance} / retorno {vacation.returnToWorkDate ?? "por confirmar"}</p>
                    <p className="text-xs text-[#667068]">Documento {vacation.documentNumber ?? "pendiente"} / proporcional proyectado {vacation.projectedBusinessDays?.toFixed(2) ?? "0.00"}</p>
                  </div>
                  <Pill className={statusClass(vacation.status)}>{vacation.status}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="rounded-md border border-brand-700 px-3 py-1.5 text-xs font-semibold text-brand-700" href={`/api/hr/vacations/${vacation.id}/papeleta?format=html`} rel="noreferrer" target="_blank">Vista previa</a>
                  <a className="rounded-md border border-brand-700 px-3 py-1.5 text-xs font-semibold text-brand-700" href={`/api/hr/vacations/${vacation.id}/papeleta?format=html#print`} rel="noreferrer" target="_blank">Imprimir</a>
                  <a className="inline-flex items-center gap-1 rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white" href={`/api/hr/vacations/${vacation.id}/papeleta?format=pdf`} rel="noreferrer" target="_blank">PDF <Download className="h-3.5 w-3.5" /></a>
                  {["borrador", "solicitada", "pendiente"].includes(vacation.status) ? <button className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700" onClick={() => action(vacation.id, "approve")} type="button">Aprobar</button> : null}
                  {!["aprobada", "rechazada", "anulada"].includes(vacation.status) ? <button className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700" onClick={() => action(vacation.id, "reject", { reason: "Rechazo registrado desde RRHH" })} type="button">Rechazar</button> : null}
                  <button className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700" disabled={vacation.status === "anulada"} onClick={() => cancelVacationRequest(vacation.id)} type="button">Anular solicitud</button>
                </div>
              </div>
            ))}
            {!vacations.length ? <p className="rounded-md border border-dashed border-[#dfe4dd] p-4 text-sm text-[#667068]">Sin comprobantes de feriado para este trabajador.</p> : null}
          </div>
        </div>
        <div className="border-t border-[#dfe4dd] p-4">
          <p className="mb-2 text-sm font-semibold text-brand-900">Movimientos</p>
          <SimpleTable headers={["Periodo", "Movimiento", "Dias", "Saldo"]}>
            {ledger.map((item) => <tr className="border-t" key={item.id}><td className="px-4 py-3">{item.period}</td><td className="px-4 py-3">{item.movementType}</td><td className="px-4 py-3">{item.days}</td><td className="px-4 py-3">{item.balanceAfter}</td></tr>)}
          </SimpleTable>
        </div>
      </SectionCard>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-brand-50 p-3"><p className="text-xs uppercase tracking-[0.08em] text-[#667068]">{label}</p><p className="mt-1 text-lg font-semibold text-brand-900">{value}</p></div>;
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

function EmployeeDocumentsTab({ employee, payslips }: { employee: HrEmployee; payslips: HrDashboardData["payslips"] }) {
  return (
    <SectionCard className="p-5">
      <h3 className="font-semibold text-brand-900">Documentos</h3>
      <p className="mt-2 text-sm text-[#667068]">Liquidaciones asociadas automaticamente a la ficha de {employee.fullName}. Los archivos permanecen en el bucket privado configurado.</p>
      <div className="mt-4 space-y-2">
        {payslips.map((payslip) => (
          <div className="flex flex-col gap-2 rounded-md border border-[#dfe4dd] bg-white p-3 text-sm md:flex-row md:items-center md:justify-between" key={payslip.id}>
            <div>
              <p className="font-semibold text-brand-900">{payslip.period} / {payslip.originalFilename}</p>
              <p className="text-xs text-[#667068]">Estado {payslip.status} / envio {payslip.sendStatus} / match {payslip.matchLevel ?? "manual"}</p>
            </div>
            <Pill className={statusClass(payslip.status)}>{formatClp(payslip.netAmount)}</Pill>
          </div>
        ))}
        {!payslips.length ? <p className="rounded-md border border-dashed border-[#dfe4dd] p-4 text-sm text-[#667068]">Sin liquidaciones asociadas a esta ficha.</p> : null}
      </div>
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
  createSelectablePayrollBatch,
  data,
  employees,
  filteredPaymentItems,
  generatePayroll,
  markSelectedPaid,
  paymentBankFilter,
  paymentAreaFilter,
  payrollEmployeeSelection,
  paymentPositionFilter,
  paymentSelection,
  paymentSort,
  paymentStatusFilter,
  payrollDraft,
  payrollSearch,
  positions,
  selectableEmployees,
  setPaymentBankFilter,
  setPaymentAreaFilter,
  setPayrollEmployeeSelection,
  setPaymentPositionFilter,
  setPaymentSelection,
  setPaymentSort,
  setPaymentStatusFilter,
  setPayrollDraft,
  setPayrollSearch,
  submitJson
}: {
  areas: string[];
  createSelectablePayrollBatch: (config: { concept: string; conceptDescription: string; glosaGlobal: string; period: string; scheduledDate: string; status: "borrador" | "pendiente_pago" | "aprobado" }) => void;
  data: HrDashboardData;
  employees: HrEmployee[];
  filteredPaymentItems: HrPaymentItem[];
  generatePayroll: () => void;
  markSelectedPaid: () => void;
  paymentBankFilter: string;
  paymentAreaFilter: string;
  payrollEmployeeSelection: string[];
  paymentPositionFilter: string;
  paymentSelection: string[];
  paymentSort: string;
  paymentStatusFilter: string;
  payrollDraft: Record<string, { amount: string; glosa: string }>;
  payrollSearch: string;
  positions: string[];
  selectableEmployees: HrEmployee[];
  setPaymentBankFilter: (value: string) => void;
  setPaymentAreaFilter: (value: string) => void;
  setPayrollEmployeeSelection: React.Dispatch<React.SetStateAction<string[]>>;
  setPaymentPositionFilter: (value: string) => void;
  setPaymentSelection: React.Dispatch<React.SetStateAction<string[]>>;
  setPaymentSort: (value: string) => void;
  setPaymentStatusFilter: (value: string) => void;
  setPayrollDraft: React.Dispatch<React.SetStateAction<Record<string, { amount: string; glosa: string }>>>;
  setPayrollSearch: (value: string) => void;
  submitJson: (event: FormEvent<HTMLFormElement>, endpoint: string, success: string) => void;
}) {
  const [concept, setConcept] = useState("remuneracion_mensual");
  const [conceptDescription, setConceptDescription] = useState("");
  const [glosaGlobal, setGlosaGlobal] = useState("");
  const [period, setPeriod] = useState(data.period);
  const [scheduledDate, setScheduledDate] = useState(today());
  const [commonAmount, setCommonAmount] = useState("");
  const selectedFilteredIds = selectableEmployees.map((employee) => employee.id);
  const selectAllFiltered = () => setPayrollEmployeeSelection((current) => Array.from(new Set([...current, ...selectedFilteredIds])));
  const applyCommonAmount = () => {
    if (!commonAmount) return;
    setPayrollDraft((current) => {
      const next = { ...current };
      for (const id of payrollEmployeeSelection) next[id] = { amount: commonAmount, glosa: next[id]?.glosa ?? "" };
      return next;
    });
  };
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
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" id="hr-glosa-global" onChange={(event) => setGlosaGlobal(event.target.value)} placeholder="Glosa global nomina" value={glosaGlobal} />
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentAreaFilter(event.target.value)} value={paymentAreaFilter}><option value="">Todas las areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentPositionFilter(event.target.value)} value={paymentPositionFilter}><option value="">Todos los cargos</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentSort(event.target.value)} value={paymentSort}><option value="name">A-Z trabajador</option><option value="amount_desc">Mayor monto</option><option value="amount_asc">Menor monto</option><option value="status">Estado</option></select>
          <p className="text-xs font-semibold text-[#667068] lg:col-span-5">Exportar tramo banco desde Template Pagos JESUS RRHH.</p>
        </div>
      </SectionCard>
      <SectionCard className="p-5">
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setPayrollSearch(event.target.value)} placeholder="Buscar trabajador o RUT" value={payrollSearch} />
          <input className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setConcept(event.target.value)} value={concept}>{paymentConcepts.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentBankFilter(event.target.value)} value={paymentBankFilter}><option value="">Banco: todos</option><option value="completo">Banco completo</option><option value="incompleto">Banco incompleto</option></select>
          <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setPaymentStatusFilter(event.target.value)} value={paymentStatusFilter}><option value="">Pago: todos</option><option value="habilitado">Habilitado</option><option value="inhabilitado">Inhabilitado</option></select>
          {paymentConcepts.find(([code]) => code === concept)?.[2] ? <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setConceptDescription(event.target.value)} placeholder="Descripcion obligatoria" value={conceptDescription} /> : null}
          <input className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setScheduledDate(event.target.value)} type="date" value={scheduledDate} />
          <input className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setCommonAmount(event.target.value)} placeholder="Monto comun" type="number" value={commonAmount} />
          <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={selectAllFiltered} type="button">Seleccionar filtrados</button>
          <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={applyCommonAmount} type="button">Aplicar monto</button>
          <button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => createSelectablePayrollBatch({ concept, conceptDescription, glosaGlobal, period, scheduledDate, status: "aprobado" })} type="button">Crear lote</button>
        </div>
        <p className="mt-3 text-xs text-[#667068]">Los trabajadores con banco incompleto pueden editarse, pero no quedan aptos para nomina bancaria hasta completar sus datos.</p>
      </SectionCard>
      <SelectableEmployeesTable employees={selectableEmployees} draft={payrollDraft} selection={payrollEmployeeSelection} setDraft={setPayrollDraft} setSelection={setPayrollEmployeeSelection} />
      <PaymentsTable employees={employees} items={filteredPaymentItems} selection={paymentSelection} setSelection={setPaymentSelection} />
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Pago manual RRHH</h3><PaymentCreateForm data={data} submitJson={submitJson} /></SectionCard>
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Anticipos avanzados</h3><AdvanceForm data={data} employees={employees} submitJson={submitJson} /></SectionCard>
        <SectionCard className="p-5"><h3 className="font-semibold text-brand-900">Finiquitos / Honorarios</h3><FiniquitoForm employees={employees} submitJson={submitJson} /><div className="my-4 border-t border-[#dfe4dd]" /><HonorarioForm data={data} submitJson={submitJson} /></SectionCard>
      </div>
    </div>
  );
}

function SelectableEmployeesTable({
  draft,
  employees,
  selection,
  setDraft,
  setSelection
}: {
  draft: Record<string, { amount: string; glosa: string }>;
  employees: HrEmployee[];
  selection: string[];
  setDraft: React.Dispatch<React.SetStateAction<Record<string, { amount: string; glosa: string }>>>;
  setSelection: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <SectionCard className="overflow-hidden">
      <TableHeader title="Nueva nomina: colaboradores seleccionables" />
      <div className="overflow-x-auto">
        <table className="min-w-[1280px] w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-[#667068]">
            <tr><th className="px-4 py-3">Sel.</th><th className="px-4 py-3">Trabajador</th><th className="px-4 py-3">RUT</th><th className="px-4 py-3">Cargo</th><th className="px-4 py-3">Area</th><th className="px-4 py-3">Banco</th><th className="px-4 py-3">Estado bancario</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Glosa individual</th><th className="px-4 py-3">Estado</th></tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const selected = selection.includes(employee.id);
              const bankReady = employee.paymentAlerts.length === 0;
              return (
                <tr className="border-t" key={employee.id}>
                  <td className="px-4 py-3"><input checked={selected} onChange={() => setSelection((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} type="checkbox" /></td>
                  <td className="px-4 py-3 font-semibold text-brand-900">{employee.fullName}</td>
                  <td className="px-4 py-3">{employee.rut}</td>
                  <td className="px-4 py-3">{employee.position || "Sin cargo"}</td>
                  <td className="px-4 py-3">{employee.area || "Sin area"}</td>
                  <td className="px-4 py-3">{employee.bankAccount?.bankName || "Sin banco"}</td>
                  <td className="px-4 py-3"><Pill className={bankReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{bankReady ? "Completo" : `Revisar: ${employee.paymentAlerts.join(", ")}`}</Pill></td>
                  <td className="px-4 py-3"><input className="w-28 rounded-md border px-2 py-1 text-sm" onChange={(event) => setDraft((current) => ({ ...current, [employee.id]: { amount: event.target.value, glosa: current[employee.id]?.glosa ?? "" } }))} type="number" value={draft[employee.id]?.amount ?? ""} /></td>
                  <td className="px-4 py-3"><input className="w-56 rounded-md border px-2 py-1 text-sm" onChange={(event) => setDraft((current) => ({ ...current, [employee.id]: { amount: current[employee.id]?.amount ?? "", glosa: event.target.value } }))} value={draft[employee.id]?.glosa ?? ""} /></td>
                  <td className="px-4 py-3">{employee.paymentEnabled ? "Habilitado" : "Inhabilitado"}</td>
                </tr>
              );
            })}
            {!employees.length ? <tr><td className="px-4 py-8 text-center text-sm text-[#667068]" colSpan={10}>Sin colaboradores activos para los filtros actuales.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
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

function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

function formHasChanges(form: HTMLFormElement) {
  return Array.from(form.elements).some((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (!element.name || element.type === "hidden" || element.type === "submit") return false;
    if (element instanceof HTMLSelectElement) return element.value !== (element.dataset.initial ?? "");
    return element.value !== element.defaultValue;
  });
}

function SalaryDataSection({ data, onSave, setMessage }: { data: HrDashboardData; onSave: (event: FormEvent<HTMLFormElement>) => void; setMessage: (message: string | null) => void }) {
  const [search, setSearch] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const salaryRows = buildSalaryRows(data)
    .filter((row) => {
      const text = `${row.employee.fullName} ${row.employee.rut} ${row.employee.area ?? ""} ${row.costCenter}`.toLowerCase();
      const hasChanges = salaryRowHasNovelty(row);
      return (!search || text.includes(search.toLowerCase())) && (!onlyChanges || hasChanges);
    });
  async function saveAllChangedRows() {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form[id^="salary-"]'));
    const rows = forms.filter(formHasChanges).map(formObject);
    if (!rows.length) {
      setMessage("No hay cambios pendientes en Datos Sueldos.");
      return;
    }
    const response = await fetch("/api/hr/accountant-data/bulk", {
      body: JSON.stringify({ rows }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    setMessage(response.ok ? `Datos Sueldos guardados: ${payload.saved ?? 0} fila(s), ${payload.auditEntries ?? 0} cambio(s) auditado(s).` : payload?.error ?? "No se pudo guardar Datos Sueldos masivo.");
  }
  const totals = salaryRows.reduce((acc, row) => ({
    advances: acc.advances + row.advances,
    bonuses: acc.bonuses + row.productionBonus + row.compensatoryBonus + row.responsibilityBonus + row.aguinaldo,
    loans: acc.loans + row.companyLoan + row.ccafLoan,
    movilization: acc.movilization + row.movilization,
    phone: acc.phone + row.phoneAllowance
  }), { advances: 0, bonuses: 0, loans: 0, movilization: 0, phone: 0 });
  return (
    <div className="space-y-4">
      <SectionCard className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">Datos Sueldos</h2>
            <p className="mt-1 text-sm text-[#667068]">Grilla mensual por trabajador activo. Periodo interno {data.period}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={saveAllChangedRows} type="button">Guardar todos los cambios</button>
            <a className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" href={`/api/hr/accountant-data?period=${data.period}`}>Exportar Excel contador</a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input className="rounded-md border px-3 py-2 text-sm md:col-span-2" onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por nombre, RUT, area o centro de costo" value={search} />
          <label className="flex items-center gap-2 text-sm"><input checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} type="checkbox" /> Solo filas con novedades</label>
          <button className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-[#4e5a52]" onClick={() => window.confirm("Copiar datos del mes anterior queda reservado para ejecucion confirmada en backend.")} type="button">Copiar mes anterior</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Bonos</p><p className="font-semibold">{formatClp(totals.bonuses)}</p></div>
          <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Anticipos</p><p className="font-semibold">{formatClp(totals.advances)}</p></div>
          <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Prestamos</p><p className="font-semibold">{formatClp(totals.loans)}</p></div>
          <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Movilizacion</p><p className="font-semibold">{formatClp(totals.movilization)}</p></div>
          <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Telefono</p><p className="font-semibold">{formatClp(totals.phone)}</p></div>
        </div>
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <SimpleTable headers={["Trabajador", "C. costo", "Inas.", "Motivo", "Lic.", "HE", "Aguinaldo", "B. prod.", "B. comp.", "B. resp.", "Rec. dom.", "Mov.", "Tel.", "Caja", "Anticipos", "P. emp.", "P. caja", "Obs.", "Guardar"]}>
          {salaryRows.map((row) => <SalaryGridRow key={row.employee.id} data={data} onSave={onSave} row={row} />)}
          {!salaryRows.length ? <tr><td className="px-4 py-8 text-center text-sm text-[#667068]" colSpan={19}>Sin trabajadores para los filtros actuales.</td></tr> : null}
        </SimpleTable>
      </SectionCard>
      <SectionCard className="p-5">
        <h3 className="font-semibold text-brand-900">Editor rapido de fila adicional</h3>
        <AccountantRowForm data={data} onSubmit={onSave} />
      </SectionCard>
    </div>
  );
}

function SalaryGridRow({ data, onSave, row }: { data: HrDashboardData; onSave: (event: FormEvent<HTMLFormElement>) => void; row: { absences: number; advances: number; aguinaldo: number; cashAllowance: number; ccafLoan: number; compensatoryBonus: number; companyLoan: number; costCenter: string; employee: HrEmployee; licenses: number; movilization: number; observations: string | null; overtimeHours: number; phoneAllowance: number; productionBonus: number; reason: string | null; responsibilityBonus: number; sundaySurcharge: number } }) {
  const input = "w-24 rounded border px-2 py-1 text-xs";
  const formId = `salary-${row.employee.id}`;
  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3 font-semibold text-brand-900">{row.employee.fullName}</td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.costCenter} name="costCenter" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.absences} name="absences" type="number" step="0.01" /></td>
      <td className="px-4 py-3"><input className="w-36 rounded border px-2 py-1 text-xs" form={formId} defaultValue={row.reason ?? ""} name="reason" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.licenses} name="licenses" type="number" step="0.01" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.overtimeHours} name="overtimeHours" type="number" step="0.01" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.aguinaldo} name="aguinaldo" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.productionBonus} name="productionBonus" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.compensatoryBonus} name="compensatoryBonus" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.responsibilityBonus} name="responsibilityBonus" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.sundaySurcharge} name="sundaySurcharge" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.movilization} name="movilization" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.phoneAllowance} name="phoneAllowance" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.cashAllowance} name="cashAllowance" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.advances} name="advances" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.companyLoan} name="companyLoan" type="number" /></td>
      <td className="px-4 py-3"><input className={input} form={formId} defaultValue={row.ccafLoan} name="ccafLoan" type="number" /></td>
      <td className="px-4 py-3"><input className="w-44 rounded border px-2 py-1 text-xs" form={formId} defaultValue={row.observations ?? ""} name="observations" /></td>
      <td className="px-4 py-3">
        <form id={formId} onSubmit={onSave}>
          <input name="period" type="hidden" value={data.period} />
          <input name="rut" type="hidden" value={row.employee.rut} />
          <input name="fullName" type="hidden" value={row.employee.fullName} />
          <button className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white" type="submit">Guardar</button>
        </form>
      </td>
    </tr>
  );
}

function PayslipsSection({
  bulkPayslipAssignments,
  bulkPayslipPreview,
  bulkPayslipSummary,
  data,
  employees,
  previewBulkPayslips,
  sendPayslips,
  setBulkPayslipAssignments,
  uploadPayslip
}: {
  bulkPayslipAssignments: Record<string, string>;
  bulkPayslipPreview: Array<Record<string, string | number | boolean | null>>;
  bulkPayslipSummary: Record<string, number> | null;
  data: HrDashboardData;
  employees: HrEmployee[];
  previewBulkPayslips: (event: FormEvent<HTMLFormElement>, commit?: boolean) => void;
  sendPayslips: (payslipIds: string[], resend?: boolean) => void;
  setBulkPayslipAssignments: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  uploadPayslip: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const submitBulkPayslips = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    previewBulkPayslips(event, submitter?.value === "commit");
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <SectionCard className="p-5">
        <h2 className="text-lg font-semibold text-brand-900">Liquidaciones</h2>
        <PayslipUploadForm data={data} employees={employees} onSubmit={uploadPayslip} />
        <button className="mt-4 w-full rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={() => sendPayslips(data.payslips.map((payslip) => payslip.id))} type="button">Enviar liquidaciones pendientes pagadas</button>
      </SectionCard>
      <div className="space-y-4">
        <SectionCard className="p-5">
          <h3 className="font-semibold text-brand-900">Carga masiva y clasificacion</h3>
          <form className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto_auto]" onSubmit={submitBulkPayslips}>
            <input className="rounded-md border px-3 py-2 text-sm" defaultValue={data.period} name="period" type="month" />
            <input accept="application/pdf" className="rounded-md border px-3 py-2 text-sm" multiple name="files" required type="file" />
            <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" type="submit" value="preview">Previsualizar</button>
            <button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" type="submit" value="commit">Confirmar autoasociadas</button>
          </form>
          {bulkPayslipSummary ? (
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md bg-brand-50 p-3"><p className="text-xs text-[#667068]">Archivos</p><p className="font-semibold">{bulkPayslipSummary.total ?? 0}</p></div>
              <div className="rounded-md bg-emerald-50 p-3 text-emerald-800"><p className="text-xs">Automaticas</p><p className="font-semibold">{bulkPayslipSummary.autoMatched ?? 0}</p></div>
              <div className="rounded-md bg-amber-50 p-3 text-amber-800"><p className="text-xs">A revision</p><p className="font-semibold">{bulkPayslipSummary.needsReview ?? 0}</p></div>
              <div className="rounded-md bg-rose-50 p-3 text-rose-800"><p className="text-xs">Duplicadas</p><p className="font-semibold">{bulkPayslipSummary.duplicates ?? 0}</p></div>
            </div>
          ) : null}
          {bulkPayslipPreview.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[820px] w-full text-left text-xs">
                <thead className="bg-brand-50 uppercase text-[#667068]"><tr><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Trabajador</th><th className="px-3 py-2">RUT</th><th className="px-3 py-2">Periodo</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Revision manual</th><th className="px-3 py-2">Estado</th></tr></thead>
                <tbody>
                  {bulkPayslipPreview.map((item, index) => (
                    <tr className="border-t" key={`${item.fileName ?? "archivo"}-${index}`}>
                      <td className="px-3 py-2">{String(item.fileName ?? "-")}</td>
                      <td className="px-3 py-2 font-semibold text-brand-900">{String(item.employeeName ?? item.detectedName ?? "Sin asociar")}</td>
                      <td className="px-3 py-2">{String(item.detectedRut ?? "-")}</td>
                      <td className="px-3 py-2">{String(item.period ?? "-")}</td>
                      <td className="px-3 py-2">{String(item.matchLevel ?? "-")} / {String(item.matchMethod ?? "-")}</td>
                      <td className="px-3 py-2">
                        <select
                          className="w-52 rounded-md border px-2 py-1 text-xs"
                          onChange={(event) => setBulkPayslipAssignments((current) => ({ ...current, [String(item.fileName ?? "")]: event.target.value }))}
                          value={bulkPayslipAssignments[String(item.fileName ?? "")] ?? ""}
                        >
                          <option value="">Sin asignacion manual</option>
                          {employees.filter((employee) => employee.status === "activo").map((employee) => (
                            <option key={employee.id} value={employee.id}>{employee.fullName} / {employee.rut}</option>
                          ))}
                        </select>
                        {item.reviewReason ? <p className="mt-1 max-w-xs text-[11px] text-[#667068]">{String(item.reviewReason)}</p> : null}
                      </td>
                      <td className="px-3 py-2"><Pill className={item.duplicate ? "border-rose-200 bg-rose-50 text-rose-800" : item.employeeId ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{item.duplicate ? "Duplicada" : item.employeeId ? "Autoasociada" : "Revision"}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SectionCard>
        <PayslipsTable payslips={data.payslips} sendPayslips={sendPayslips} />
      </div>
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
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  async function previewVacation(form: HTMLFormElement) {
    const formData = new FormData(form);
    const payload = {
      advanceAuthorized: formData.get("advanceAuthorized") === "on",
      employeeId,
      endDate: String(formData.get("endDate") ?? ""),
      fractionationAgreement: formData.get("fractionationAgreement") === "on",
      requestedBusinessDays: formData.get("requestedBusinessDays") ? Number(formData.get("requestedBusinessDays")) : undefined,
      startDate: String(formData.get("startDate") ?? "")
    };
    const response = await fetch("/api/hr/vacations/preview", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = await response.json().catch(() => null);
    setPreview(result?.preview ?? { error: result?.error ?? "preview_failed" });
  }
  return (
    <>
      <form className="mt-4 space-y-3" onSubmit={(event) => submitJson(event, "/api/hr/vacations", "Vacaciones registradas.")}>
        <input name="employeeId" type="hidden" value={employeeId} />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="documentDate" type="date" defaultValue={today()} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="w-full rounded-md border px-3 py-2 text-sm" name="contractPeriodStart" type="date" />
          <input className="w-full rounded-md border px-3 py-2 text-sm" name="contractPeriodEnd" type="date" />
        </div>
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="startDate" type="date" required />
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="w-full rounded-md border px-3 py-2 text-sm" name="requestedBusinessDays" placeholder="Dias habiles solicitados" type="number" step="0.01" />
          <input className="w-full rounded-md border px-3 py-2 text-sm" name="endDate" type="date" />
        </div>
        <select className="w-full rounded-md border px-3 py-2 text-sm" name="status"><option value="borrador">Borrador</option><option value="solicitada">Solicitada</option><option value="pendiente">Pendiente</option><option value="aprobada">Aprobar y generar comprobante</option><option value="rechazada">Rechazada</option></select>
        <label className="flex items-center gap-2 text-sm"><input name="fractionalVacation" type="checkbox" /> Feriado fraccionado</label>
        <label className="flex items-center gap-2 text-sm"><input name="fractionationAgreement" type="checkbox" /> Existe acuerdo de fraccionamiento</label>
        <label className="flex items-center gap-2 text-sm"><input name="advanceAuthorized" type="checkbox" /> Autorizar vacaciones anticipadas</label>
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="observation" placeholder="Observacion" />
        <input className="w-full rounded-md border px-3 py-2 text-sm" name="note" placeholder="Nota comprobante" />
        {preview ? (
          <div className="rounded-md border border-brand-100 bg-brand-50 p-3 text-xs text-brand-900">
            {"error" in preview ? <p>Vista previa no disponible: {String(preview.error)}</p> : (
              <div className="grid gap-1 sm:grid-cols-2">
                <p>Dias habiles: {String(preview.businessDays ?? "-")}</p>
                <p>Ultimo dia computado: {String(preview.lastCountedVacationDate ?? "-")}</p>
                <p>Fin descanso: {String(preview.effectiveRestEndDate ?? "-")}</p>
                <p>Reincorporacion: {String(preview.returnToWorkDate ?? "-")}</p>
                <p>Proporcional proyectado: {Number(preview.projectedProportional ?? 0).toFixed(6)}</p>
                <p>Anticipo: {String(preview.advanceDays ?? 0)} dias</p>
                <p>FIFO: {Array.isArray(preview.allocations) ? preview.allocations.length : 0} periodos</p>
                <p>Valido: {preview.valid ? "SI" : "NO"}</p>
              </div>
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700" onClick={(event) => previewVacation(event.currentTarget.form as HTMLFormElement)} type="button">Vista previa</button>
          <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Guardar solicitud</button>
        </div>
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

function TableHeader({ action, title }: { action?: React.ReactNode; title: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-[#dfe4dd] bg-white p-4"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-brand-700" /><h3 className="font-semibold text-brand-900">{title}</h3></div>{action}</div>;
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
