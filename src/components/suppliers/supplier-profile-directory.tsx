"use client";

import { useMemo, useState } from "react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { SupplierPaymentProfile } from "@/lib/suppliers/supabase-profiles";

function text(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

export function SupplierProfileDirectory({ initialSuppliers }: { initialSuppliers: SupplierPaymentProfile[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [selectedId, setSelectedId] = useState(initialSuppliers[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = suppliers.find((supplier) => supplier.id === selectedId) ?? suppliers[0];
  const [draft, setDraft] = useState<SupplierPaymentProfile | null>(selected ?? null);
  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const haystack = text([supplier.rut, supplier.legalName, supplier.tradeName, supplier.bankName, supplier.category, supplier.paymentEmail, supplier.invoices.map((invoice) => invoice.folio).join(" ")].join(" "));
    return (!query || haystack.includes(text(query))) && (filter === "todos" || (filter === "listos" && supplier.paymentReady) || (filter === "incompletos" && !supplier.paymentReady) || (filter === "deuda" && supplier.pending > 0));
  }).slice(0, 160), [filter, query, suppliers]);

  function choose(supplier: SupplierPaymentProfile) { setSelectedId(supplier.id); setDraft(supplier); setEditing(false); setMessage(""); }
  async function save() {
    if (!draft) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/suppliers/${draft.id}`, { body: JSON.stringify(draft), headers: { "Content-Type": "application/json" }, method: "PUT" });
    if (!response.ok) { setMessage("No se pudo guardar. Revise campos obligatorios y sesion."); setBusy(false); return; }
    setSuppliers((rows) => rows.map((row) => row.id === draft.id ? { ...draft, source: "manual" } : row));
    setEditing(false); setBusy(false); setMessage("Ficha guardada y auditada.");
  }
  function field<K extends keyof SupplierPaymentProfile>(key: K, value: SupplierPaymentProfile[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); }
  const missing = draft?.missingPaymentFields ?? selected?.missingPaymentFields ?? [];

  return <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
    <div className="rounded-lg border border-[#eadfd9] bg-white shadow-sm"><div className="grid gap-3 border-b border-[#eadfd9] p-4 md:grid-cols-[1fr_0.45fr]"><input className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="RUT, razon social, banco, factura o categoria" value={query} /><select className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="todos">Todos</option><option value="listos">Aptos pago</option><option value="incompletos">Faltan datos</option><option value="deuda">Con deuda</option></select></div><div className="max-h-[820px] divide-y divide-[#f0e5df] overflow-auto">{filtered.map((supplier) => <button className={`grid w-full gap-2 p-4 text-left md:grid-cols-[1fr_0.45fr] ${supplier.id === selected?.id ? "bg-brand-50" : ""}`} key={supplier.id} onClick={() => choose(supplier)} type="button"><div><p className="font-semibold text-brand-900">{supplier.legalName}</p><p className="text-sm text-[#6f6263]">{supplier.rut} / {supplier.bankName || "sin banco"}</p></div><div className="text-right"><p className="font-semibold">{formatClp(supplier.pending)}</p><p className={`text-xs font-semibold ${supplier.paymentReady ? "text-emerald-700" : "text-amber-800"}`}>{supplier.paymentReady ? "Apto para pago" : `Falta ${supplier.missingPaymentFields.join(", ")}`}</p></div></button>)}</div></div>
    {selected && draft ? <aside className="rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-brand-700">Ficha editable</p><h2 className="mt-1 text-xl font-semibold text-brand-900">{selected.legalName}</h2><p className="text-sm text-[#6f6263]">Origen {selected.source} / {selected.rut}</p></div><div className="flex gap-2">{editing ? <><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" disabled={busy} onClick={save} type="button">Guardar</button><button className="rounded-md border px-3 py-2 text-sm" onClick={() => { setDraft(selected); setEditing(false); }} type="button">Cancelar</button></> : <button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => setEditing(true)} type="button">Editar</button>}</div></div>{message ? <p className="mt-3 rounded-md bg-brand-50 p-2 text-sm text-brand-900">{message}</p> : null}<p className={`mt-4 rounded-md p-3 text-sm ${missing.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-800"}`}>{missing.length ? `Faltan datos para pago: ${missing.join(", ")}.` : "Proveedor apto para exportacion Santander."}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{([["legalName","Razon social"],["tradeName","Nombre comercial"],["giro","Giro"],["address","Direccion"],["commune","Comuna"],["city","Ciudad"],["contactName","Contacto"],["phone","Telefono"],["paymentEmail","Email pagos"],["commercialEmail","Email comercial"],["bankName","Banco"],["bankCode","Codigo banco"],["accountType","Tipo cuenta"],["accountNumber","Numero cuenta"],["paymentTermsLabel","Condicion pago"],["category","Categoria"],["observations","Observaciones"]] as Array<[keyof SupplierPaymentProfile,string]>).map(([key,label]) => <label className={key === "observations" ? "sm:col-span-2" : ""} key={key}><span className="text-xs text-[#6f6263]">{label}</span>{key === "observations" ? <textarea className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field(key, event.target.value)} value={String(draft[key] ?? "")} /> : <input className="mt-1 w-full rounded-md border p-2 text-sm disabled:bg-[#fbf7f4]" disabled={!editing} onChange={(event) => field(key, event.target.value)} value={String(draft[key] ?? "")} />}</label>)}<label><span className="text-xs text-[#6f6263]">Dias credito</span><input className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("paymentTermsDays", Number(event.target.value))} type="number" value={draft.paymentTermsDays} /></label><label><span className="text-xs text-[#6f6263]">Estado</span><select className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("status", event.target.value)} value={draft.status}><option value="active">Activo</option><option value="draft">Incompleto</option><option value="blocked">Bloqueado</option><option value="archived">Archivado</option></select></label></div><div className="mt-5"><h3 className="font-semibold text-brand-900">Facturas asociadas</h3><div className="mt-2 max-h-44 overflow-auto">{selected.invoices.slice(0, 20).map((invoice) => <div className="flex justify-between border-t py-2 text-sm" key={invoice.folio}><span>{invoice.folio} / {invoice.date} / {invoice.status}</span><b>{formatClp(invoice.total)}</b></div>)}</div></div></aside> : null}
  </section>;
}
