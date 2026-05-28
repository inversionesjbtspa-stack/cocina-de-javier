"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clipboard, Search } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";
import type { DteOperationalInvoice } from "@/lib/dte/invoice-operations";

function localDate(value: string) {
  return value.slice(0, 10);
}

function relativeRange(quick: string) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  if (quick === "ayer") start.setDate(today.getDate() - 1);
  if (quick === "7") start.setDate(today.getDate() - 6);
  if (quick === "mes") start.setDate(1);
  return { end, start: start.toISOString().slice(0, 10) };
}

function badgeClass(tone: "green" | "orange" | "blue" | "violet" | "red" | "neutral") {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "border-[#eadfd9] bg-white text-[#6f6263]",
    orange: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700"
  };
  return `inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${tones[tone]}`;
}

function claimLabel(status?: string | null) {
  if (status === "enviado" || status === "enviado_manualmente") return "Reclamo enviado";
  if (status === "resuelto") return "XML recibido";
  if (status === "ignorado") return "Reclamo ignorado";
  return "Reclamo pendiente";
}

function paymentBadge(invoice: DteOperationalInvoice) {
  const status = invoice.paymentStatus.toLowerCase();
  const isPastDue = localDate(invoice.issuedAt) < new Date().toISOString().slice(0, 10) && status !== "paid";
  if (status === "paid" || status === "pagada") return { label: "Pagada", tone: "blue" as const };
  if (["scheduled", "in_batch", "en_nomina", "en nomina", "en_tesoreria"].includes(status)) return { label: "En nomina", tone: "violet" as const };
  if (isPastDue) return { label: "Vencida", tone: "red" as const };
  return { label: invoice.paymentStatus, tone: "neutral" as const };
}

export function InvoiceDayDirectory({ invoices }: { invoices: DteOperationalInvoice[] }) {
  const [basis, setBasis] = useState<"received" | "issued">("received");
  const [quick, setQuick] = useState("mes");
  const [query, setQuery] = useState("");
  const [xmlFilter, setXmlFilter] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const range = relativeRange(quick);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const lower = quick === "custom" ? from : quick === "hoy" ? range.end : quick === "ayer" ? range.start : range.start;
    const upper = quick === "custom" ? to : quick === "ayer" ? range.start : range.end;
    return invoices.filter((invoice) => {
      const date = localDate(basis === "received" ? invoice.receivedAt : invoice.issuedAt);
      const haystack = [
        invoice.folio,
        invoice.supplier,
        invoice.rut,
        invoice.issuedAt,
        invoice.receivedAt,
        invoice.total,
        invoice.net,
        invoice.itemNames.join(" "),
        invoice.xmlStatus,
        invoice.paymentStatus
      ].join(" ").toLowerCase();
      return (!lower || date >= lower) && (!upper || date <= upper) && (!needle || haystack.includes(needle));
    }).filter((invoice) => {
      if (xmlFilter === "con_xml") return invoice.xmlStatus !== "pendiente_xml";
      if (xmlFilter === "pendientes_xml") return invoice.xmlStatus === "pendiente_xml";
      if (xmlFilter === "origen_sii") return invoice.sourceType === "sii";
      if (xmlFilter === "manuales") return invoice.sourceType === "manual";
      if (xmlFilter === "pagadas") return invoice.paymentStatus === "paid";
      if (xmlFilter === "pendientes_pago") return invoice.paymentStatus !== "paid";
      return true;
    });
  }, [basis, from, invoices, query, quick, range.end, range.start, to, xmlFilter]);

  const groups = useMemo(() => {
    const grouped = new Map<string, DteOperationalInvoice[]>();
    filtered.forEach((invoice) => {
      const key = localDate(basis === "received" ? invoice.receivedAt : invoice.issuedAt);
      grouped.set(key, [...(grouped.get(key) ?? []), invoice]);
    });
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [basis, filtered]);

  function claimText(invoice: DteOperationalInvoice) {
    return `Asunto:\n[XML PENDIENTE] Folio ${invoice.folio} - La Cocina de Javier\n\nCuerpo:\nEstimado proveedor,\n\nDetectamos en el Registro de Compras del SII una factura emitida a La Cocina de Javier, pero aun no hemos recibido el XML en nuestro correo:\n\ndte@lacocinadejavier.cl\n\nDocumento pendiente:\n- Folio ${invoice.folio}\n- Fecha ${localDate(invoice.issuedAt)}\n- Monto ${formatClp(invoice.total)}\n\nFavor reenviar el XML correspondiente a dte@lacocinadejavier.cl para poder procesar pago y registro interno.\n\nSaludos,\nLa Cocina de Javier`;
  }

  async function copyClaim(invoice: DteOperationalInvoice) {
    await navigator.clipboard.writeText(claimText(invoice));
    if (invoice.siiRegistryId) {
      await fetch("/api/sii/claim", {
        body: JSON.stringify({ claimStatus: "copiado", ids: [invoice.siiRegistryId] }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
    }
    setMessage(`Reclamo XML copiado para folio ${invoice.folio}.`);
  }

  async function markClaim(invoice: DteOperationalInvoice, claimStatus: "enviado" | "resuelto" | "ignorado") {
    if (!invoice.siiRegistryId) return;
    await fetch("/api/sii/claim", {
      body: JSON.stringify({ claimStatus, ids: [invoice.siiRegistryId] }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    setMessage(`Reclamo folio ${invoice.folio}: ${claimStatus}.`);
  }

  return (
    <section className="rounded-lg border border-[#eadfd9] bg-white p-5 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr]">
        <label>
          <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]"><Search className="h-4 w-4" />Buscar</span>
          <input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Folio, proveedor, RUT, producto, monto o estado" value={query} />
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Agrupar</span>
          <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setBasis(event.target.value as typeof basis)} value={basis}>
            <option value="received">Recepcion Gmail</option><option value="issued">Emision DTE</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Periodo</span>
          <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuick(event.target.value)} value={quick}>
            <option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="7">Ultimos 7 dias</option><option value="mes">Mes actual</option><option value="custom">Rango</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Estado</span>
          <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setXmlFilter(event.target.value)} value={xmlFilter}>
            <option value="todas">Todas</option><option value="con_xml">Con XML</option><option value="pendientes_xml">Pendientes XML</option><option value="origen_sii">Origen SII</option><option value="manuales">Manuales</option><option value="pagadas">Pagadas</option><option value="pendientes_pago">Pendientes pago</option>
          </select>
        </label>
        <label><span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]"><CalendarDays className="h-4 w-4" />Desde</span><input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => { setQuick("custom"); setFrom(event.target.value); }} type="date" value={from} /></label>
        <label><span className="text-sm font-medium text-[#6f6263]">Hasta</span><input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => { setQuick("custom"); setTo(event.target.value); }} type="date" value={to} /></label>
      </div>
      {message ? <p className="mt-3 rounded-md border border-[#eadfd9] bg-[#fffdfb] px-3 py-2 text-sm text-brand-900">{message}</p> : null}
      <p className="mt-3 text-sm text-[#6f6263]">{filtered.length} documentos visibles en {groups.length} dia(s).</p>
      <div className="mt-5 space-y-4">
        {groups.map(([date, rows]) => {
          const total = rows.reduce((sum, row) => sum + row.total, 0);
          const suppliers = new Set(rows.map((row) => row.rut)).size;
          return (
            <article className="overflow-hidden rounded-lg border border-[#eadfd9]" key={date}>
              <header className="flex flex-wrap items-center justify-between gap-3 bg-brand-50 px-4 py-3">
                <div><h3 className="font-semibold text-brand-900">{date}</h3><p className="text-xs text-[#6f6263]">{rows.length} documentos / {suppliers} proveedores</p></div>
                <p className="font-semibold text-brand-900">{formatClp(total)}</p>
              </header>
              <div className="overflow-x-auto"><table className="w-full min-w-[1280px] text-sm"><thead className="bg-white text-left text-xs uppercase text-brand-700"><tr><th className="px-3 py-2">Folio</th><th className="min-w-[220px]">Proveedor</th><th>RUT</th><th>Emision</th><th>Recepcion</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Total</th><th>Estado XML</th><th>Estado pago</th><th>Acciones</th></tr></thead><tbody>
                {rows.map((invoice) => {
                  const isPendingXml = invoice.xmlStatus === "pendiente_xml";
                  const isSii = invoice.sourceType === "sii";
                  const isSiiPending = invoice.sourceType === "sii" && isPendingXml;
                  const payment = paymentBadge(invoice);
                  return (
                    <tr className="border-t border-[#f0e5df] align-top hover:bg-[#fffaf6]" key={invoice.id}>
                      <td className="px-3 py-3 font-semibold text-brand-900">{invoice.tipoDte}-{invoice.folio}</td>
                      <td className="px-3 py-3">
                        <p>{invoice.supplier}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {invoice.sourceType === "sii" ? <span className={badgeClass("orange")}>Detectado SII</span> : null}
                          {invoice.sourceType === "manual" ? <span className={badgeClass("neutral")}>Origen Manual</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{invoice.rut}</td>
                      <td className="px-3 py-3">{localDate(invoice.issuedAt)}</td>
                      <td className="px-3 py-3">{localDate(invoice.receivedAt)}</td>
                      <td className="px-3 py-3 text-right">{formatClp(invoice.net)}</td>
                      <td className="px-3 py-3 text-right">{formatClp(invoice.iva)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatClp(invoice.total)}</td>
                      <td className="px-3 py-3">
                        <span className={badgeClass(isPendingXml ? "orange" : "green")}>{isPendingXml ? "Pendiente XML" : "XML recibido"}</span>
                        {isSiiPending ? <span className={`${badgeClass("orange")} mt-1`}>Provisional</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <span className={badgeClass(payment.tone)}>{payment.label}</span>
                        {invoice.sourceType === "sii" ? <span className={`${badgeClass(invoice.claimStatus === "resuelto" ? "green" : "orange")} mt-1`}>{claimLabel(invoice.claimStatus)}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2 whitespace-nowrap">
                        {isSii ? (
                          <>
                            {isPendingXml ? <button className="font-semibold text-amber-800 hover:underline" onClick={() => copyClaim(invoice)} type="button"><Clipboard className="mr-1 inline h-3.5 w-3.5" />Copiar reclamo</button> : null}
                            {isPendingXml ? <button className="font-semibold text-brand-700 hover:underline" onClick={() => markClaim(invoice, "enviado")} type="button">Marcar enviado</button> : null}
                            {isPendingXml ? <button className="font-semibold text-emerald-700 hover:underline" onClick={() => markClaim(invoice, "resuelto")} type="button">Resolver</button> : null}
                            <a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${invoice.folio}`}>Detalle</a>
                          </>
                        ) : isPendingXml ? (
                          <>
                            <span className="text-xs font-semibold text-amber-800">XML pendiente proveedor</span>
                            <a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${invoice.folio}`}>Detalle</a>
                          </>
                        ) : (
                          <>
                            <a className="font-semibold text-brand-700 hover:underline" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">Ver</a>
                            <a className="font-semibold text-brand-700 hover:underline" href={`/api/invoices/${invoice.folio}/pdf?download=1`}>Descargar</a>
                            <a className="font-semibold text-brand-700 hover:underline" href={`/api/invoices/${invoice.folio}/xml`}>XML</a>
                            <a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${invoice.folio}`}>Detalle</a>
                          </>
                        )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody></table></div>
            </article>
          );
        })}
        {!groups.length ? <div className="rounded-md border border-dashed border-[#eadfd9] p-8 text-center text-sm text-[#6f6263]">Sin facturas para el filtro activo.</div> : null}
      </div>
    </section>
  );
}
