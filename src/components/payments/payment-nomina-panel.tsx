"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { PayableCandidate } from "@/lib/payments/payables";

export function PaymentNominaPanel({ candidates }: { candidates: PayableCandidate[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quick, setQuick] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("");
  const [status, setStatus] = useState("todos");
  const [payDate, setPayDate] = useState("");
  const suppliers = useMemo(() => [...new Map(candidates.map((row) => [row.supplierId, row.supplierName])).entries()], [candidates]);
  const filtered = useMemo(() => {
    const today = new Date();
    const quickEnd = new Date(today); quickEnd.setDate(today.getDate() + Number(quick === "custom" ? 3650 : quick));
    const needle = query.toLowerCase().trim();
    return candidates.filter((row) => {
      const due = new Date(`${row.dueDate}T00:00:00`);
      const haystack = [row.documentNumber, row.supplierName, row.supplierRut, row.balance, row.status].join(" ").toLowerCase();
      return (!needle || haystack.includes(needle)) && (!supplierId || row.supplierId === supplierId) && (quick === "custom" || due <= quickEnd) && (!from || row.dueDate >= from) && (!to || row.dueDate <= to) && (!issueFrom || row.issueDate >= issueFrom) && (!issueTo || row.issueDate <= issueTo) && (status === "todos" || status === row.status || (status === "vencidas" && due < today));
    });
  }, [candidates, from, issueFrom, issueTo, query, quick, status, supplierId, to]);
  const selectedRows = candidates.filter((row) => selected.includes(row.id));
  const invalid = selectedRows.filter((row) => !row.ok);
  const total = selectedRows.reduce((sum, row) => sum + row.balance, 0);
  const selectedSuppliers = new Set(selectedRows.map((row) => row.supplierId)).size;
  const currentSupplierRows = supplierId ? filtered.filter((row) => row.supplierId === supplierId) : [];
  function toggle(id: string) { setSelected((rows) => rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id]); }
  function selectVisible() { setSelected(filtered.filter((row) => row.ok).map((row) => row.id)); }
  function selectSupplier() { setSelected((rows) => [...new Set([...rows, ...currentSupplierRows.filter((row) => row.ok).map((row) => row.id)])]); }

  return <section className="space-y-4 rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm" id="nomina-pagos">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-brand-900">Pagar por proveedor y nomina Santander</h2><p className="text-sm text-[#6f6263]">Seleccione proveedor completo o facturas individuales desde cuentas por pagar reales.</p></div><div className="flex flex-wrap gap-2"><span className="rounded-md bg-brand-50 px-3 py-2 text-sm">{selected.length} facturas / {selectedSuppliers} proveedores / <b>{formatClp(total)}</b></span><button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={selectVisible} type="button">Seleccionar todo visible</button><button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={() => setSelected([])} type="button">Quitar seleccion</button>{!selected.length || invalid.length ? <button className="rounded-md bg-[#d8d0cc] px-4 py-2 text-sm font-semibold text-white" disabled type="button"><AlertTriangle className="mr-1 inline h-4 w-4" />{!selected.length ? "Seleccione pagos" : "Datos incompletos"}</button> : <a className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white" href={`/api/payment-template?payableIds=${encodeURIComponent(selected.join(","))}&payDate=${encodeURIComponent(payDate)}`}><FileSpreadsheet className="mr-1 inline h-4 w-4" />Exportar Santander</a>}</div></div>
    <div className="grid gap-3 lg:grid-cols-6"><input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setQuery(event.target.value)} placeholder="Folio, proveedor, RUT o monto" value={query} /><select className="rounded-md border px-3 py-2 text-sm lg:col-span-2" onChange={(event) => setSupplierId(event.target.value)} value={supplierId}><option value="">Todos los proveedores</option>{suppliers.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select><select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setQuick(event.target.value)} value={quick}><option value="0">Hoy</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="custom">Rango</option></select><select className="rounded-md border px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}><option value="todos">Todo estado</option><option value="pending_approval">Pendiente</option><option value="approved">Aprobada</option><option value="scheduled">En nomina</option><option value="vencidas">Vencidas</option></select><label className="text-xs">Vence desde<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => { setQuick("custom"); setFrom(event.target.value); }} type="date" value={from} /></label><label className="text-xs">Vence hasta<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => { setQuick("custom"); setTo(event.target.value); }} type="date" value={to} /></label><label className="text-xs">Emision desde<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setIssueFrom(event.target.value)} type="date" value={issueFrom} /></label><label className="text-xs">Emision hasta<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setIssueTo(event.target.value)} type="date" value={issueTo} /></label><label className="text-xs">Fecha pago nomina<input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setPayDate(event.target.value)} type="date" value={payDate} /></label>{supplierId ? <button className="self-end rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={selectSupplier} type="button">Seleccionar proveedor</button> : null}</div>
    {invalid.length ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Proveedores con datos incompletos: {invalid.map((row) => `${row.supplierName}: ${row.alerts.join(", ")}`).join(" / ")}</p> : null}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1080px] text-sm"><thead className="sticky top-0 bg-brand-50 text-left text-xs uppercase text-brand-700"><tr><th className="p-3">Sel.</th><th>Proveedor</th><th>Factura</th><th>Emision</th><th>Vence</th><th className="text-right">Saldo</th><th>Banco</th><th>Estado</th><th>Validacion</th></tr></thead><tbody>{filtered.map((row) => <tr className="border-t" key={row.id}><td className="p-3"><input checked={selected.includes(row.id)} onChange={() => toggle(row.id)} type="checkbox" /></td><td><p className="font-semibold">{row.supplierName}</p><p className="text-xs">{row.supplierRut}</p></td><td>{row.documentNumber}</td><td>{row.issueDate}</td><td>{row.dueDate}</td><td className="text-right font-semibold">{formatClp(row.balance)}</td><td>{row.bankName || "Sin banco"}</td><td>{row.status}</td><td>{row.ok ? <span className="text-emerald-700">Listo</span> : <span className="text-amber-800">{row.alerts.join(", ")}</span>}</td></tr>)}</tbody></table>{!filtered.length ? <p className="p-6 text-sm text-[#6f6263]">Sin cuentas por pagar para el filtro.</p> : null}</div>
  </section>;
}
