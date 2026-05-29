"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FileSpreadsheet, Link2, RefreshCw, X } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import { mapBankName } from "@/lib/payments/bank-mappings";
import type { PayableCandidate, PayableDiagnostics } from "@/lib/payments/payables";

type InvalidExportRow = { alerts: string[]; bankCode?: string; bankName?: string; folio: string; id: string; proveedor: string; rut: string; supplierId?: string };
type ExportIssue = { invalid: InvalidExportRow[]; title: string };

function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}
function errorCsv(rows: InvalidExportRow[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [["proveedor", "rut", "folio", "datos_faltantes"], ...rows.map((row) => [row.proveedor, row.rut, row.folio, row.alerts.join(", ")])].map((row) => row.map(escape).join(";")).join("\n");
}

export function PaymentNominaPanel({ candidates, diagnostics }: { candidates: PayableCandidate[]; diagnostics?: PayableDiagnostics }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quick, setQuick] = useState("todos");
  const [origin, setOrigin] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("");
  const [status, setStatus] = useState("todos");
  const [sort, setSort] = useState("due_asc");
  const [payDate, setPayDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [issue, setIssue] = useState<ExportIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const suppliers = useMemo(() => [...new Map(candidates.map((row) => [row.supplierId, row.supplierName])).entries()], [candidates]);
  const filtered = useMemo(() => {
    const today = new Date();
      const quickEnd = new Date(today);
    quickEnd.setDate(today.getDate() + Number(quick === "custom" || quick === "todos" ? 3650 : quick));
    const needle = query.toLowerCase().trim();
    const rows = candidates.filter((row) => {
      const due = new Date(`${row.dueDate}T00:00:00`);
      const haystack = [row.documentNumber, row.supplierName, row.supplierRut, row.paymentBeneficiaryName, row.paymentBeneficiaryRut, row.balance, row.status, row.sourceType, row.xmlStatus].join(" ").toLowerCase();
      return (!needle || haystack.includes(needle)) &&
        (!supplierId || row.supplierId === supplierId) &&
        (quick === "todos" || quick === "custom" || due <= quickEnd) &&
        (origin === "todos" || row.sourceType === origin || (origin === "sii" && row.payableWithoutXml)) &&
        (!from || row.dueDate >= from) &&
        (!to || row.dueDate <= to) &&
        (!issueFrom || row.issueDate >= issueFrom) &&
        (!issueTo || row.issueDate <= issueTo) &&
        (!minAmount || row.balance >= Number(minAmount)) &&
        (!maxAmount || row.balance <= Number(maxAmount)) &&
        (status === "todos" ||
          status === row.status ||
          (status === "vencidas" && due < today) ||
          (status === "sin_banco" && (!row.bankAccount || !row.bankCode)) ||
          (status === "aptas" && row.ok));
    });
    return rows.sort((a, b) => {
      if (sort === "amount_desc") return b.balance - a.balance;
      if (sort === "amount_asc") return a.balance - b.balance;
      if (sort === "issue_desc") return b.issueDate.localeCompare(a.issueDate);
      if (sort === "supplier_asc") return a.supplierName.localeCompare(b.supplierName);
      if (sort === "status_asc") return a.status.localeCompare(b.status);
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [candidates, from, issueFrom, issueTo, maxAmount, minAmount, origin, query, quick, sort, status, supplierId, to]);
  const selectedRows = candidates.filter((row) => selected.includes(row.id));
  const invalidSelected = selectedRows.filter((row) => !row.ok);
  const total = selectedRows.reduce((sum, row) => sum + row.balance, 0);
  const selectedSuppliers = new Set(selectedRows.map((row) => row.supplierId)).size;
  const currentSupplierRows = supplierId ? filtered.filter((row) => row.supplierId === supplierId) : [];
  const activeSupplier = candidates.find((row) => row.supplierId === supplierId);

  function toggle(row: PayableCandidate) {
    if (!row.ok) return;
    setSelected((rows) => rows.includes(row.id) ? rows.filter((id) => id !== row.id) : [...rows, row.id]);
  }
  function selectVisible() {
    setSelected(filtered.filter((row) => row.ok).map((row) => row.id));
  }
  function selectSupplier() {
    setSelected((rows) => [...new Set([...rows, ...currentSupplierRows.filter((row) => row.ok).map((row) => row.id)])]);
  }
  function removeSupplier() {
    setSelected((rows) => rows.filter((id) => !currentSupplierRows.some((row) => row.id === id)));
  }
  async function exportSantander() {
    if (!selected.length || invalidSelected.length) return;
    setBusy(true);
    setIssue(null);
    const response = await fetch(`/api/payment-template?payableIds=${encodeURIComponent(selected.join(","))}&payDate=${encodeURIComponent(payDate)}`, { headers: { "X-ERP-Request": "treasury" } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ invalid: [] }));
      setIssue({ invalid: body.invalid ?? [], title: "No se pudo generar la nomina Santander" });
      setBusy(false);
      return;
    }
    download(await response.blob(), "Template Pagos JESUS - nomina ERP.xlsx");
    setBusy(false);
    window.location.reload();
  }
  async function repairSuppliers() {
    setBusy(true);
    setRepairMessage("");
    const response = await fetch("/api/admin/repair-payment-suppliers", { method: "POST" });
    const body = await response.json().catch(() => null);
    setRepairMessage(response.ok ? `Reparacion ejecutada: ${body?.relinked ?? 0} cuentas enlazadas, ${body?.created ?? 0} fichas creadas.` : "No se pudo ejecutar la reparacion.");
    setBusy(false);
  }
  async function repairBankCodes() {
    setBusy(true);
    setRepairMessage("");
    const response = await fetch("/api/admin/repair-bank-codes", { method: "POST" });
    const body = await response.json().catch(() => null);
    setRepairMessage(response.ok ? `Codigos banco reparados: ${body?.bankCodesCompleted ?? 0}. Bancos sin mapping: ${body?.unmappedBanks?.length ?? 0}.` : "No se pudo reparar codigos banco.");
    setBusy(false);
    if (response.ok) window.location.reload();
  }
  async function createManualPayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setRepairMessage("");
    const form = event.currentTarget;
    const response = await fetch("/api/accounts-payable/manual", {
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const body = await response.json().catch(() => null);
    setRepairMessage(response.ok ? (body?.existing ? "La factura manual ya existia en Tesoreria." : "Factura manual creada en Tesoreria.") : body?.error ?? "No se pudo crear la factura manual.");
    setBusy(false);
    if (response.ok) window.location.reload();
  }

  return <section className="space-y-4 rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm" id="nomina-pagos">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-brand-900">Pagar por proveedor y nomina Santander</h2><p className="text-sm text-[#6f6263]">Seleccione cuentas exportables. Las incompletas quedan en revision de proveedor.</p></div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-brand-50 px-3 py-2 text-sm">{selected.length} facturas / {selectedSuppliers} proveedores / <b>{formatClp(total)}</b></span>
        <span className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-[#eadfd9]">{diagnostics?.fetched ?? candidates.length} cuentas / {diagnostics?.valid ?? candidates.filter((row) => row.ok).length} validas / <b>{formatClp(diagnostics?.totalBalance ?? candidates.reduce((sum, row) => sum + row.balance, 0))}</b></span>
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={selectVisible} type="button">Seleccionar todo visible</button>
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={() => setSelected([])} type="button">Quitar seleccion</button>
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={() => setManualOpen((value) => !value)} type="button">Agregar factura manual</button>
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={repairSuppliers} type="button"><RefreshCw className="mr-1 inline h-4 w-4" />Reparar proveedores</button>
        <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" disabled={busy} onClick={repairBankCodes} type="button"><RefreshCw className="mr-1 inline h-4 w-4" />Reparar codigos banco</button>
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-[#d8d0cc]" disabled={!selected.length || invalidSelected.length > 0 || busy} onClick={exportSantander} type="button"><FileSpreadsheet className="mr-1 inline h-4 w-4" />{busy ? "Generando..." : "Exportar Santander"}</button>
      </div>
    </div>
    {diagnostics?.error ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Diagnostico query cuentas por pagar: {diagnostics.error}</p> : null}
    {repairMessage ? <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-900">{repairMessage}</p> : null}
    {manualOpen ? <form className="grid gap-3 rounded-lg border border-[#eadfd9] bg-[#fbf8f5] p-4 lg:grid-cols-8" onSubmit={createManualPayable}>
      <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" name="supplierName" placeholder="Proveedor" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="rut" placeholder="RUT" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="documentType" placeholder="Tipo doc" defaultValue="manual" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="folio" placeholder="Folio" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="issueDate" type="date" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="dueDate" type="date" required />
      <input className="rounded-md border px-3 py-2 text-sm" name="amount" placeholder="Monto" type="number" min="1" required />
      <button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-[#d8d0cc]" disabled={busy} type="submit">Crear</button>
    </form> : null}
    <div className="grid gap-3 lg:grid-cols-6">
      <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setQuery(event.target.value)} placeholder="Folio, proveedor, RUT o monto" value={query} />
      <select className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setSupplierId(event.target.value)} value={supplierId}><option value="">Todos los proveedores</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setQuick(event.target.value)} value={quick}><option value="todos">Todos los vencimientos</option><option value="0">Hoy</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="custom">Rango</option></select>
      <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setOrigin(event.target.value)} value={origin}><option value="todos">Origen XML/SII/manual</option><option value="xml">XML</option><option value="sii">SII pendiente XML</option><option value="manual">Manual</option></select>
      <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}><option value="todos">Todo estado</option><option value="pending_approval">Pendientes</option><option value="approved">Aprobadas</option><option value="scheduled">En nomina</option><option value="paid">Pagadas</option><option value="vencidas">Vencidas</option><option value="sin_banco">Sin banco</option><option value="aptas">Aptas para pago</option></select>
      <select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setSort(event.target.value)} value={sort}><option value="due_asc">Orden: vence primero</option><option value="amount_desc">Mayor monto</option><option value="amount_asc">Menor monto</option><option value="issue_desc">Fecha emision</option><option value="supplier_asc">Proveedor A-Z</option><option value="status_asc">Estado pago</option></select>
      <label className="text-xs">Vence desde<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => { setQuick("custom"); setFrom(event.target.value); }} type="date" value={from} /></label>
      <label className="text-xs">Vence hasta<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => { setQuick("custom"); setTo(event.target.value); }} type="date" value={to} /></label>
      <label className="text-xs">Emision desde<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setIssueFrom(event.target.value)} type="date" value={issueFrom} /></label>
      <label className="text-xs">Emision hasta<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setIssueTo(event.target.value)} type="date" value={issueTo} /></label>
      <label className="text-xs">Monto desde<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setMinAmount(event.target.value)} type="number" value={minAmount} /></label>
      <label className="text-xs">Monto hasta<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setMaxAmount(event.target.value)} type="number" value={maxAmount} /></label>
      <label className="text-xs">Fecha pago nomina<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setPayDate(event.target.value)} type="date" value={payDate} /></label>
      {supplierId ? <div className="flex flex-wrap items-end gap-2 lg:col-span-2"><button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={selectSupplier} type="button">Seleccionar proveedor completo</button><button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={removeSupplier} type="button">Quitar proveedor</button>{activeSupplier ? <a className="rounded-md border px-3 py-2 text-sm font-semibold" href={`/proveedores?supplier=${activeSupplier.supplierId}`}><Link2 className="mr-1 inline h-4 w-4" />Ver ficha</a> : null}</div> : null}
    </div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1440px] text-sm"><thead className="sticky top-0 bg-brand-50 text-left text-xs uppercase text-brand-700"><tr><th className="p-3">Sel.</th><th>Facturador | Beneficiario</th><th>Proveedor facturador</th><th>Beneficiario pago</th><th>Factura</th><th>Emision</th><th>Vence</th><th className="text-right">Monto</th><th>Banco</th><th>Estado pago</th><th>Validacion</th><th>Accion</th></tr></thead><tbody>{filtered.map((row) => { const mapping = mapBankName(row.bankName); const canRepairBank = Boolean(row.bankName && !row.bankCode && mapping.bankCode && !mapping.needsReview); return <tr className="border-t align-top hover:bg-[#fffaf6]" key={row.id}><td className="p-3"><input checked={selected.includes(row.id)} disabled={!row.ok} onChange={() => toggle(row)} type="checkbox" /></td><td className="p-3"><p className="font-semibold text-brand-900">{row.supplierName}</p><p className="text-xs text-[#6f6263]">| {row.paymentBeneficiaryName}</p></td><td className="p-3"><p className="font-semibold text-brand-900">{row.supplierName}</p><p className="text-xs text-[#6f6263]">{row.supplierRut || "Sin RUT"}</p><p className="mt-1 text-xs">{row.sourceType === "manual" ? "Manual" : row.sourceType === "sii" || row.payableWithoutXml ? "SII pendiente XML" : "XML recibido"}</p></td><td className="p-3"><p className="font-semibold">{row.paymentBeneficiaryName}</p><p className="text-xs text-[#6f6263]">{row.paymentBeneficiaryRut || row.supplierRut || "RUT pendiente"}</p>{row.paymentBeneficiaryRut && row.paymentBeneficiaryRut !== row.supplierRut ? <p className="text-xs text-amber-800">Factura emitida por {row.supplierName}</p> : null}</td><td className="p-3">{row.documentNumber}{row.payableWithoutXml ? <p className="text-xs text-amber-800">Pendiente XML</p> : null}</td><td className="p-3">{row.issueDate}</td><td className="p-3">{row.dueDate}</td><td className="p-3 text-right font-semibold">{formatClp(row.balance)}</td><td className="p-3"><p>{row.bankName || "Sin banco"}</p>{row.bankCode ? <p className="text-xs text-emerald-700">Codigo {row.bankCode}</p> : mapping.bankCode ? <p className="text-xs text-amber-800">Reconocido: {mapping.bankNameNormalized} / falta aplicar codigo {mapping.bankCode}</p> : null}</td><td className="p-3">{row.status}</td><td className="p-3">{row.ok ? <span className="text-emerald-700">Apta{row.xmlStatus === "missing" ? " / verificar SII" : ""}</span> : <span className="text-amber-800">Incompleta: {row.alerts.join(", ")}</span>}</td><td className="space-y-1 p-3"><a className="block font-semibold text-brand-700 hover:underline" href={`/proveedores?supplier=${row.supplierId}`}>{row.ok ? "Ver ficha" : "Corregir proveedor"}</a>{canRepairBank ? <button className="block font-semibold text-brand-700 underline" disabled={busy} onClick={repairBankCodes} type="button">Autocorregir banco</button> : null}</td></tr>; })}</tbody></table>{!filtered.length ? <p className="p-6 text-sm text-[#6f6263]">Sin cuentas por pagar para el filtro.</p> : null}</div>
    {issue ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-brand-900">{issue.title}</h3><p className="mt-1 text-sm text-[#6f6263]">Complete los datos faltantes antes de exportar al template Santander.</p></div><button className="rounded-md border p-2" onClick={() => setIssue(null)} type="button"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{issue.invalid.map((row) => <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" key={row.id}><p className="font-semibold">{row.proveedor} / {row.rut || "RUT faltante"} / {row.folio}</p><p className="mt-1">Banco: {row.bankName || "No informado"} / Codigo: {row.bankCode || "faltante"}.</p><p className="mt-1">Dato requerido: {row.alerts.join(", ")}.</p><div className="mt-2 flex flex-wrap gap-3">{row.supplierId ? <a className="font-semibold underline" href={`/proveedores?supplier=${row.supplierId}`}>Corregir ficha proveedor</a> : null}<button className="font-semibold underline" disabled={busy} onClick={repairBankCodes} type="button">Reparar codigos banco</button></div></div>)}</div><button className="mt-4 rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={() => download(new Blob([errorCsv(issue.invalid)], { type: "text/csv;charset=utf-8" }), "errores-nomina-santander.csv")} type="button">Descargar reporte de errores</button></div></div> : null}
  </section>;
}
