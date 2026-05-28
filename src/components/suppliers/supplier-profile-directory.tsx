"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import { paymentMissingFields, type SupplierPaymentProfile } from "@/lib/suppliers/supabase-profiles";

function text(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function withPaymentState(profile: SupplierPaymentProfile) {
  const missingPaymentFields = paymentMissingFields(profile);
  return { ...profile, missingPaymentFields, paymentReady: missingPaymentFields.length === 0 };
}
function blankProfile(): SupplierPaymentProfile {
  return { accountHolderName: "", accountHolderRut: "", accountNumber: "", accountType: "", address: "", bankAccountId: null, bankCode: "", bankName: "", category: "", city: "", commercialEmail: "", commune: "", contactName: "", email: "", giro: "", id: "new", invoices: [], legalName: "", missingPaymentFields: ["RUT", "razon social", "banco", "codigo banco", "tipo de cuenta", "numero de cuenta", "email de pagos"], observations: "", overdue: 0, paymentEmail: "", paymentReady: false, paymentTermsDays: 30, paymentTermsLabel: "", pending: 0, phone: "", rut: "", source: "manual", status: "draft", tradeName: "" };
}

export function SupplierProfileDirectory({ initialSelectedId, initialSuppliers }: { initialSelectedId?: string; initialSuppliers: SupplierPaymentProfile[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? initialSuppliers[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = suppliers.find((supplier) => supplier.id === selectedId) ?? suppliers[0];
  const [draft, setDraft] = useState<SupplierPaymentProfile | null>(selected ?? null);
  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const haystack = text([supplier.rut, supplier.legalName, supplier.tradeName, supplier.bankName, supplier.category, supplier.paymentEmail, supplier.invoices.map((invoice) => invoice.folio).join(" ")].join(" "));
    return (!query || haystack.includes(text(query))) && (filter === "todos" || (filter === "listos" && supplier.paymentReady) || (filter === "incompletos" && !supplier.paymentReady) || (filter === "deuda" && supplier.pending > 0));
  }).slice(0, 160), [filter, query, suppliers]);

  function choose(supplier: SupplierPaymentProfile) { setSelectedId(supplier.id); setDraft(supplier); setEditing(false); setCreating(false); setMessage(""); }
  function startCreate() { const profile = blankProfile(); setSelectedId(profile.id); setDraft(profile); setCreating(true); setEditing(true); setMessage(""); }
  async function save() {
    if (!draft) return;
    setBusy(true); setMessage("");
    const response = await fetch(creating ? "/api/suppliers" : `/api/suppliers/${draft.id}`, { body: JSON.stringify(draft), headers: { "Content-Type": "application/json" }, method: creating ? "POST" : "PUT" });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setMessage(body?.error === "supplier_rut_exists" ? "Ese RUT ya existe en proveedores." : "No se pudo guardar. Revise RUT, razon social y campos obligatorios."); setBusy(false); return; }
    const saved = withPaymentState({ ...draft, id: body?.supplier?.id ?? draft.id, source: "manual" });
    setSuppliers((rows) => creating ? [saved, ...rows] : rows.map((row) => row.id === draft.id ? saved : row));
    setSelectedId(saved.id); setDraft(saved); setCreating(false); setEditing(false); setBusy(false); setMessage("Ficha guardada y auditada.");
  }
  async function repairFromMaster() {
    if (!shown?.id) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/repair-payment-suppliers", { method: "POST" });
    const body = await response.json().catch(() => null);
    setBusy(false);
    setMessage(response.ok ? `Datos reparados desde maestro: ${body?.suppliersCompleted ?? 0} fichas, ${body?.bankProfilesCompleted ?? 0} cuentas bancarias.` : "No se pudo reparar desde maestro.");
    if (response.ok) window.location.reload();
  }
  function field<K extends keyof SupplierPaymentProfile>(key: K, value: SupplierPaymentProfile[K]) { setDraft((current) => current ? withPaymentState({ ...current, [key]: value }) : current); }
  const missing = draft?.missingPaymentFields ?? selected?.missingPaymentFields ?? [];
  const shown = draft ?? selected;

  return <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
    <div className="rounded-lg border border-[#eadfd9] bg-white shadow-sm">
      <div className="grid gap-3 border-b border-[#eadfd9] p-4 md:grid-cols-[1fr_0.45fr_auto]"><input className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="RUT, razon social, banco, factura o categoria" value={query} /><select className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="todos">Todos</option><option value="listos">Aptos pago</option><option value="incompletos">Faltan datos</option><option value="deuda">Con deuda</option></select><button className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={startCreate} type="button"><Plus className="h-4 w-4" />Nueva ficha proveedor</button></div>
      <div className="max-h-[820px] divide-y divide-[#f0e5df] overflow-auto">{filtered.map((supplier) => <button className={`grid w-full gap-2 p-4 text-left md:grid-cols-[1fr_0.45fr] ${supplier.id === selected?.id && !creating ? "bg-brand-50" : ""}`} key={supplier.id} onClick={() => choose(supplier)} type="button"><div><p className="font-semibold text-brand-900">{supplier.legalName}</p><p className="text-sm text-[#6f6263]">{supplier.rut} / {supplier.bankName || "sin banco"}</p></div><div className="text-right"><p className="font-semibold">{formatClp(supplier.pending)}</p><p className={`text-xs font-semibold ${supplier.paymentReady ? "text-emerald-700" : "text-amber-800"}`}>{supplier.paymentReady ? "Apto para pago" : `Falta ${supplier.missingPaymentFields.join(", ")}`}</p></div></button>)}</div>
    </div>
    {shown ? <aside className="rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-brand-700">{creating ? "Nueva ficha proveedor" : "Ficha editable"}</p><h2 className="mt-1 text-xl font-semibold text-brand-900">{shown.legalName || "Proveedor nuevo"}</h2><p className="text-sm text-[#6f6263]">Origen {shown.source} / {shown.rut || "RUT pendiente"}</p></div><div className="flex flex-wrap gap-2">{editing ? <><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" disabled={busy} onClick={save} type="button">Guardar</button><button className="rounded-md border px-3 py-2 text-sm" onClick={() => { setDraft(selected ?? null); setCreating(false); setEditing(false); }} type="button">Cancelar</button></> : <><button className="rounded-md border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={repairFromMaster} type="button">Reparar datos proveedor desde maestro</button><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => setEditing(true)} type="button">Editar</button></>}</div></div>
      {message ? <p className="mt-3 rounded-md bg-brand-50 p-2 text-sm text-brand-900">{message}</p> : null}
      <p className={`mt-4 rounded-md p-3 text-sm ${missing.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-800"}`}>{missing.length ? `Faltan datos para pago: ${missing.join(", ")}.` : "Proveedor apto para exportacion Santander."}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{([["rut", "RUT"], ["legalName", "Razon social facturador"], ["tradeName", "Nombre comercial"], ["giro", "Giro"], ["address", "Direccion"], ["commune", "Comuna"], ["city", "Ciudad"], ["contactName", "Contacto"], ["phone", "Telefono"], ["paymentEmail", "Email pagos"], ["commercialEmail", "Email comercial"], ["bankName", "Banco"], ["bankCode", "Codigo banco"], ["accountType", "Tipo cuenta"], ["accountNumber", "Numero cuenta"], ["accountHolderName", "Beneficiario de pago / Pagar a"], ["accountHolderRut", "RUT beneficiario"], ["paymentTermsLabel", "Condicion pago"], ["category", "Categoria"], ["observations", "Observaciones"]] as Array<[keyof SupplierPaymentProfile, string]>).map(([key, label]) => <label className={key === "observations" ? "sm:col-span-2" : ""} key={key}><span className="text-xs text-[#6f6263]">{label}</span>{key === "observations" ? <textarea className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field(key, event.target.value)} value={String(shown[key] ?? "")} /> : <input className="mt-1 w-full rounded-md border p-2 text-sm disabled:bg-[#fbf7f4]" disabled={!editing || (key === "rut" && !creating)} onChange={(event) => field(key, event.target.value)} value={String(shown[key] ?? "")} />}</label>)}<label><span className="text-xs text-[#6f6263]">Dias credito</span><input className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("paymentTermsDays", Number(event.target.value))} type="number" value={shown.paymentTermsDays} /></label><label><span className="text-xs text-[#6f6263]">Estado</span><select className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("status", event.target.value)} value={shown.status}><option value="active">Activo</option><option value="draft">Incompleto</option><option value="blocked">Bloqueado</option><option value="archived">Archivado</option></select></label></div>
      {!creating ? <div className="mt-5"><h3 className="font-semibold text-brand-900">Facturas asociadas</h3><div className="mt-2 max-h-44 overflow-auto">{shown.invoices.slice(0, 20).map((invoice) => <div className="flex justify-between border-t py-2 text-sm" key={invoice.folio}><span>{invoice.folio} / {invoice.date} / {invoice.status}</span><b>{formatClp(invoice.total)}</b></div>)}</div><a className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline" href={`/auditoria?query=${encodeURIComponent(shown.id)}`}>Ver historial auditado</a></div> : null}
    </aside> : null}
  </section>;
}
