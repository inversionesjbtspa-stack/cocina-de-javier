"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link2, Plus, Search, X } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import { paymentMissingFields, type PaymentBeneficiaryAssignment, type SupplierPaymentProfile } from "@/lib/suppliers/supabase-profiles";

function text(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function withPaymentState(profile: SupplierPaymentProfile) {
  const missingPaymentFields = paymentMissingFields(profile);
  return { ...profile, missingPaymentFields, paymentReady: missingPaymentFields.length === 0 };
}
function blankProfile(): SupplierPaymentProfile {
  return { accountHolderName: "", accountHolderRut: "", accountNumber: "", accountType: "", address: "", assignedPaymentBeneficiary: null, bankAccountId: null, bankCode: "", bankName: "", category: "", city: "", commercialEmail: "", commune: "", contactName: "", email: "", giro: "", id: "new", invoices: [], legalName: "", missingPaymentFields: ["RUT", "razon social", "banco", "codigo banco", "tipo de cuenta", "numero de cuenta", "email de pagos"], observations: "", overdue: 0, paymentEmail: "", paymentReady: false, paymentTermsDays: 30, paymentTermsLabel: "", pending: 0, phone: "", rut: "", source: "manual", status: "draft", tradeName: "" };
}

type BeneficiaryOption = Omit<PaymentBeneficiaryAssignment, "reason"> & {
  commercialEmail?: string;
  phone?: string;
  source?: "master" | "supplier" | "beneficiary";
  sourceId?: string;
};
type CompletionPreview = {
  bankChanges: Array<{ field: string; label: string; next: string; source: string }>;
  contactChanges: Array<{ field: string; label: string; next: string; source: string }>;
  hasMaster: boolean;
  hasPaymentBeneficiary: boolean;
  supplierChanges: Array<{ field: string; label: string; next: string; source: string }>;
};

export function SupplierProfileDirectory({ initialSelectedId, initialSuppliers }: { initialSelectedId?: string; initialSuppliers: SupplierPaymentProfile[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? initialSuppliers[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [beneficiaryModalOpen, setBeneficiaryModalOpen] = useState(false);
  const [beneficiaryQuery, setBeneficiaryQuery] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryOption[]>([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiaryOption | null>(null);
  const [beneficiaryReason, setBeneficiaryReason] = useState("");
  const [creatingBeneficiary, setCreatingBeneficiary] = useState(false);
  const [completionPreview, setCompletionPreview] = useState<CompletionPreview | null>(null);
  const [masterSuggestion, setMasterSuggestion] = useState<CompletionPreview | null>(null);
  const [ignoredSuggestionFor, setIgnoredSuggestionFor] = useState("");
  const selected = suppliers.find((supplier) => supplier.id === selectedId) ?? suppliers[0];
  const [draft, setDraft] = useState<SupplierPaymentProfile | null>(selected ?? null);
  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const haystack = text([supplier.rut, supplier.legalName, supplier.tradeName, supplier.bankName, supplier.category, supplier.paymentEmail, supplier.invoices.map((invoice) => invoice.folio).join(" ")].join(" "));
    return (!query || haystack.includes(text(query))) && (filter === "todos" || (filter === "listos" && supplier.paymentReady) || (filter === "incompletos" && !supplier.paymentReady) || (filter === "deuda" && supplier.pending > 0));
  }).slice(0, 160), [filter, query, suppliers]);
  const shown = draft ?? selected;
  const missing = draft?.missingPaymentFields ?? selected?.missingPaymentFields ?? [];

  useEffect(() => {
    let cancelled = false;
    async function loadSuggestion() {
      if (!shown?.id || shown.id === "new" || creating || editing || ignoredSuggestionFor === shown.id) {
        setMasterSuggestion(null);
        return;
      }
      const response = await fetch(`/api/suppliers/${shown.id}/complete-from-master`);
      const body = await response.json().catch(() => null);
      const preview = response.ok ? body?.preview as CompletionPreview | null : null;
      const hasSuggestions = preview ? [...preview.supplierChanges, ...preview.bankChanges, ...preview.contactChanges].length > 0 : false;
      if (!cancelled) setMasterSuggestion(hasSuggestions ? preview : null);
    }
    void loadSuggestion();
    return () => { cancelled = true; };
  }, [creating, editing, ignoredSuggestionFor, shown?.id]);

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
  async function previewMasterCompletion() {
    if (!shown?.id) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/suppliers/${shown.id}/complete-from-master`);
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(body?.error ?? "No se pudo leer el maestro.");
      return;
    }
    setCompletionPreview(body.preview);
  }
  async function applyMasterCompletion() {
    if (!shown?.id) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/suppliers/${shown.id}/complete-from-master`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(body?.error ?? "No se pudo completar desde maestro.");
      return;
    }
    setCompletionPreview(null);
    setMessage("Ficha completada desde maestro sin sobrescribir datos existentes.");
    window.location.reload();
  }
  async function searchBeneficiaries(query = beneficiaryQuery) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/payment-beneficiaries?q=${encodeURIComponent(query)}`);
    const body = await response.json().catch(() => null);
    setBeneficiaries(response.ok ? body?.beneficiaries ?? [] : []);
    setMessage(response.ok ? "" : "No se pudo buscar beneficiarios de pago.");
    setBusy(false);
  }
  function openBeneficiaryModal() {
    setBeneficiaryModalOpen(true);
    setSelectedBeneficiary(null);
    setBeneficiaryReason(shown?.assignedPaymentBeneficiary?.reason ?? "");
    void searchBeneficiaries("");
  }
  function beneficiaryComplete(beneficiary: BeneficiaryOption) {
    return Boolean(beneficiary.status === "active" && beneficiary.name && beneficiary.rut && beneficiary.bankName && beneficiary.bankCode && beneficiary.accountType && beneficiary.accountNumber && beneficiary.paymentEmail);
  }
  async function assignBeneficiary() {
    if (!shown || !selectedBeneficiary || !beneficiaryComplete(selectedBeneficiary)) return;
    setBusy(true); setMessage("");
    const fromCatalog = selectedBeneficiary.source === "beneficiary" || !selectedBeneficiary.source;
    const response = await fetch(`/api/suppliers/${shown.id}/payment-beneficiary`, {
      body: JSON.stringify({
        beneficiary: fromCatalog ? undefined : selectedBeneficiary,
        beneficiaryId: fromCatalog ? selectedBeneficiary.id : undefined,
        reason: beneficiaryReason
      }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(body?.error ?? "No se pudo asignar beneficiario.");
      return;
    }
    window.location.reload();
  }
  async function createBeneficiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    const response = await fetch("/api/payment-beneficiaries", {
      body: JSON.stringify({
        accountNumber: String(form.get("accountNumber") ?? ""),
        accountType: String(form.get("accountType") ?? ""),
        bankCode: String(form.get("bankCode") ?? ""),
        bankName: String(form.get("bankName") ?? ""),
        name: String(form.get("name") ?? ""),
        observation: String(form.get("observation") ?? ""),
        paymentEmail: String(form.get("paymentEmail") ?? ""),
        rut: String(form.get("rut") ?? ""),
        status: "active"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(body?.error ?? "No se pudo crear beneficiario.");
      return;
    }
    setBeneficiaries((items) => [body.beneficiary, ...items.filter((item) => item.id !== body.beneficiary.id)]);
    setSelectedBeneficiary(body.beneficiary);
    setCreatingBeneficiary(false);
  }
  async function removeBeneficiary() {
    if (!shown) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/suppliers/${shown.id}/payment-beneficiary`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(body?.error ?? "No se pudo quitar beneficiario.");
      return;
    }
    window.location.reload();
  }
  function field<K extends keyof SupplierPaymentProfile>(key: K, value: SupplierPaymentProfile[K]) { setDraft((current) => current ? withPaymentState({ ...current, [key]: value }) : current); }

  return <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
    <div className="rounded-lg border border-[#eadfd9] bg-white shadow-sm">
      <div className="grid gap-3 border-b border-[#eadfd9] p-4 md:grid-cols-[1fr_0.45fr_auto]"><input className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="RUT, razon social, banco, factura o categoria" value={query} /><select className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="todos">Todos</option><option value="listos">Aptos pago</option><option value="incompletos">Faltan datos</option><option value="deuda">Con deuda</option></select><button className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={startCreate} type="button"><Plus className="h-4 w-4" />Nueva ficha proveedor</button></div>
      <div className="max-h-[820px] divide-y divide-[#f0e5df] overflow-auto">{filtered.map((supplier) => <button className={`grid w-full gap-2 p-4 text-left md:grid-cols-[1fr_0.45fr] ${supplier.id === selected?.id && !creating ? "bg-brand-50" : ""}`} key={supplier.id} onClick={() => choose(supplier)} type="button"><div><p className="font-semibold text-brand-900">{supplier.legalName}</p><p className="text-sm text-[#6f6263]">{supplier.rut} / {supplier.bankName || "sin banco"}</p></div><div className="text-right"><p className="font-semibold">{formatClp(supplier.pending)}</p><p className={`text-xs font-semibold ${supplier.paymentReady ? "text-emerald-700" : "text-amber-800"}`}>{supplier.paymentReady ? "Apto para pago" : `Falta ${supplier.missingPaymentFields.join(", ")}`}</p></div></button>)}</div>
    </div>
    {shown ? <aside className="rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-brand-700">{creating ? "Nueva ficha proveedor" : "Ficha editable"}</p><h2 className="mt-1 text-xl font-semibold text-brand-900">{shown.legalName || "Proveedor nuevo"}</h2><p className="text-sm text-[#6f6263]">Origen {shown.source} / {shown.rut || "RUT pendiente"}</p></div><div className="flex flex-wrap gap-2">{editing ? <><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" disabled={busy} onClick={save} type="button">Guardar</button><button className="rounded-md border px-3 py-2 text-sm" onClick={() => { setDraft(selected ?? null); setCreating(false); setEditing(false); }} type="button">Cancelar</button></> : <><button className="rounded-md border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={previewMasterCompletion} type="button">Completar desde maestro</button><button className="rounded-md border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={repairFromMaster} type="button">Reparar datos proveedor desde maestro</button><button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" disabled={creating || busy} onClick={openBeneficiaryModal} type="button"><Link2 className="mr-1 inline h-4 w-4" />Asignar otra cuenta bancaria</button><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => setEditing(true)} type="button">Editar</button></>}</div></div>
      {message ? <p className="mt-3 rounded-md bg-brand-50 p-2 text-sm text-brand-900">{message}</p> : null}
      {masterSuggestion ? <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-semibold">Se encontraron datos adicionales en Maestro JESUS</p><p className="mt-1">{[...masterSuggestion.supplierChanges, ...masterSuggestion.bankChanges, ...masterSuggestion.contactChanges].length} campos vacios se pueden completar sin sobrescribir informacion existente.</p><div className="mt-2 flex flex-wrap gap-2"><button className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" disabled={busy} onClick={() => setCompletionPreview(masterSuggestion)} type="button">Aplicar sugerencias</button><button className="rounded-md border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800" onClick={() => { setIgnoredSuggestionFor(shown.id); setMasterSuggestion(null); }} type="button">Ignorar</button></div></div> : null}
      <p className={`mt-4 rounded-md p-3 text-sm ${missing.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-800"}`}>{missing.length ? `Faltan datos para pago: ${missing.join(", ")}.` : "Proveedor apto para exportacion Santander."}</p>
      {shown.assignedPaymentBeneficiary ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="grid gap-3 sm:grid-cols-2"><p><span className="block text-xs font-semibold uppercase text-amber-800">Proveedor facturador</span>{shown.legalName}</p><p><span className="block text-xs font-semibold uppercase text-amber-800">Beneficiario pago</span>{shown.assignedPaymentBeneficiary.name}</p><p><span className="block text-xs font-semibold uppercase text-amber-800">RUT beneficiario</span>{shown.assignedPaymentBeneficiary.rut}</p><p><span className="block text-xs font-semibold uppercase text-amber-800">Cuenta destino</span>{shown.assignedPaymentBeneficiary.bankName} / {shown.assignedPaymentBeneficiary.accountNumber}</p></div><p className="mt-2">Motivo: {shown.assignedPaymentBeneficiary.reason || "Sin motivo registrado"}</p><button className="mt-2 rounded-md border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-800" disabled={busy} onClick={removeBeneficiary} type="button">Quitar asignacion y volver a cuenta propia</button></div> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{([["rut", "RUT"], ["legalName", "Razon social facturador"], ["tradeName", "Nombre comercial"], ["giro", "Giro"], ["address", "Direccion"], ["commune", "Comuna"], ["city", "Ciudad"], ["contactName", "Contacto"], ["phone", "Telefono"], ["paymentEmail", "Email pagos"], ["commercialEmail", "Email comercial"], ["bankName", "Banco"], ["bankCode", "Codigo banco"], ["accountType", "Tipo cuenta"], ["accountNumber", "Numero cuenta"], ["accountHolderName", "Beneficiario de pago / Pagar a"], ["accountHolderRut", "RUT beneficiario"], ["paymentTermsLabel", "Condicion pago"], ["category", "Categoria"], ["observations", "Observaciones"]] as Array<[keyof SupplierPaymentProfile, string]>).map(([key, label]) => <label className={key === "observations" ? "sm:col-span-2" : ""} key={key}><span className="text-xs text-[#6f6263]">{label}</span>{key === "observations" ? <textarea className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field(key, event.target.value)} value={String(shown[key] ?? "")} /> : <input className="mt-1 w-full rounded-md border p-2 text-sm disabled:bg-[#fbf7f4]" disabled={!editing || (key === "rut" && !creating)} onChange={(event) => field(key, event.target.value)} value={String(shown[key] ?? "")} />}</label>)}<label><span className="text-xs text-[#6f6263]">Dias credito</span><input className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("paymentTermsDays", Number(event.target.value))} type="number" value={shown.paymentTermsDays} /></label><label><span className="text-xs text-[#6f6263]">Estado</span><select className="mt-1 w-full rounded-md border p-2 text-sm" disabled={!editing} onChange={(event) => field("status", event.target.value)} value={shown.status}><option value="active">Activo</option><option value="draft">Incompleto</option><option value="blocked">Bloqueado</option><option value="archived">Archivado</option></select></label></div>
      {!creating ? <div className="mt-5"><h3 className="font-semibold text-brand-900">Facturas asociadas</h3><div className="mt-2 max-h-44 overflow-auto">{shown.invoices.slice(0, 20).map((invoice) => <div className="flex justify-between border-t py-2 text-sm" key={invoice.folio}><span>{invoice.folio} / {invoice.date} / {invoice.status}</span><b>{formatClp(invoice.total)}</b></div>)}</div><a className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline" href={`/auditoria?query=${encodeURIComponent(shown.id)}`}>Ver historial auditado</a></div> : null}
      {beneficiaryModalOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-brand-900">Asignar otra cuenta bancaria</h3><p className="mt-1 text-sm text-[#6f6263]">La busqueda combina Maestro JESUS, proveedores y beneficiarios ya registrados.</p></div><button className="rounded-md border p-2" onClick={() => setBeneficiaryModalOpen(false)} type="button"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]"><label><span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]"><Search className="h-4 w-4" />Buscar beneficiario</span><input className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setBeneficiaryQuery(event.target.value)} placeholder="Nombre, razon social, RUT o email" value={beneficiaryQuery} /></label><button className="self-end rounded-md border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={() => searchBeneficiaries()} type="button">Buscar</button><button className="self-end rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700" onClick={() => setCreatingBeneficiary((value) => !value)} type="button"><Plus className="mr-1 inline h-4 w-4" />Nuevo</button></div>{creatingBeneficiary ? <form className="mt-4 rounded-md border border-brand-100 bg-[#fbf7f4] p-3" onSubmit={createBeneficiary}><div className="grid gap-3 md:grid-cols-2"><input className="rounded-md border p-2 text-sm" name="name" placeholder="Nombre beneficiario" required /><input className="rounded-md border p-2 text-sm" name="rut" placeholder="RUT beneficiario" required /><input className="rounded-md border p-2 text-sm" name="bankName" placeholder="Banco" required /><input className="rounded-md border p-2 text-sm" name="bankCode" placeholder="Codigo banco" required /><input className="rounded-md border p-2 text-sm" name="accountType" placeholder="Tipo cuenta" required /><input className="rounded-md border p-2 text-sm" name="accountNumber" placeholder="Numero cuenta" required /><input className="rounded-md border p-2 text-sm" name="paymentEmail" placeholder="Email pago" required type="email" /><input className="rounded-md border p-2 text-sm" name="observation" placeholder="Observacion" /></div><div className="mt-3 flex justify-end"><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white" disabled={busy} type="submit">Guardar beneficiario</button></div></form> : null}<div className="mt-4 max-h-64 divide-y overflow-auto rounded-md border">{beneficiaries.map((beneficiary) => { const complete = beneficiaryComplete(beneficiary); const sourceLabel = beneficiary.source === "master" ? "Maestro JESUS" : beneficiary.source === "supplier" ? "Proveedores" : "Beneficiarios"; return <button className={`grid w-full gap-2 p-3 text-left md:grid-cols-[1fr_0.75fr] ${selectedBeneficiary?.id === beneficiary.id ? "bg-brand-50" : ""}`} disabled={!complete} key={beneficiary.id} onClick={() => setSelectedBeneficiary(beneficiary)} type="button"><div><p className="font-semibold text-brand-900">{beneficiary.name}</p><p className="text-xs text-[#6f6263]">{beneficiary.rut} / {beneficiary.paymentEmail || "sin email"}</p><p className="mt-1 text-xs font-semibold text-brand-700">{sourceLabel}</p></div><div><p className="text-sm">{beneficiary.bankName} / {beneficiary.bankCode}</p><p className={complete ? "text-xs text-emerald-700" : "text-xs text-amber-800"}>{complete ? `${beneficiary.accountType} ${beneficiary.accountNumber}` : "Beneficiario incompleto"}</p>{beneficiary.phone ? <p className="text-xs text-[#6f6263]">{beneficiary.phone}</p> : null}</div></button>; })}{!beneficiaries.length ? <p className="p-4 text-sm text-[#6f6263]">Sin beneficiarios para la busqueda.</p> : null}</div>{selectedBeneficiary ? <div className="mt-4 grid gap-3 rounded-md border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900 sm:grid-cols-2"><p><span className="block text-xs font-semibold uppercase text-brand-700">Factura emitida por</span>{shown.legalName}</p><p><span className="block text-xs font-semibold uppercase text-brand-700">Se pagara a</span>{selectedBeneficiary.name}</p><p><span className="block text-xs font-semibold uppercase text-brand-700">RUT</span>{selectedBeneficiary.rut}</p><p><span className="block text-xs font-semibold uppercase text-brand-700">Banco</span>{selectedBeneficiary.bankName} / codigo {selectedBeneficiary.bankCode}</p><p><span className="block text-xs font-semibold uppercase text-brand-700">Cuenta</span>{selectedBeneficiary.accountType} {selectedBeneficiary.accountNumber}</p><p><span className="block text-xs font-semibold uppercase text-brand-700">Email</span>{selectedBeneficiary.paymentEmail}</p></div> : null}<label className="mt-4 block"><span className="text-sm font-medium text-[#6f6263]">Motivo / asociacion</span><textarea className="mt-1 w-full rounded-md border p-2 text-sm" onChange={(event) => setBeneficiaryReason(event.target.value)} placeholder="Ej: FAST GAS autoriza pago a Patricio Ortega" value={beneficiaryReason} /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><button className="rounded-md border px-3 py-2 text-sm" onClick={() => setBeneficiaryModalOpen(false)} type="button">Cancelar</button><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={!selectedBeneficiary || !beneficiaryComplete(selectedBeneficiary) || busy} onClick={assignBeneficiary} type="button">Confirmar asignacion</button></div></div></div> : null}
      {completionPreview ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-brand-900">Completar desde maestro</h3><p className="mt-1 text-sm text-[#6f6263]">Solo se rellenan campos vacios. No se sobrescribe informacion existente.</p></div><button className="rounded-md border p-2" onClick={() => setCompletionPreview(null)} type="button"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-3">{[...completionPreview.supplierChanges, ...completionPreview.bankChanges, ...completionPreview.contactChanges].length ? [...completionPreview.supplierChanges, ...completionPreview.bankChanges, ...completionPreview.contactChanges].map((item) => <div className="grid gap-2 rounded-md border border-[#eadfd9] p-3 text-sm sm:grid-cols-[0.7fr_1fr_0.7fr]" key={`${item.field}-${item.label}`}><span className="font-semibold text-brand-900">{item.label}</span><span>{item.next}</span><span className="text-xs text-[#6f6263]">{item.source}</span></div>) : <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">No hay campos vacios para completar.</p>}</div><div className="mt-4 flex justify-end gap-2"><button className="rounded-md border px-3 py-2 text-sm" onClick={() => setCompletionPreview(null)} type="button">Cancelar</button><button className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || ![...completionPreview.supplierChanges, ...completionPreview.bankChanges, ...completionPreview.contactChanges].length} onClick={applyMasterCompletion} type="button">Completar y guardar</button></div></div></div> : null}
    </aside> : null}
  </section>;
}
