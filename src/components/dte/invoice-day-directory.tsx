"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
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

export function InvoiceDayDirectory({ invoices }: { invoices: DteOperationalInvoice[] }) {
  const [basis, setBasis] = useState<"received" | "issued">("received");
  const [quick, setQuick] = useState("mes");
  const [query, setQuery] = useState("");
  const [xmlFilter, setXmlFilter] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
            <option value="todas">Todas</option><option value="con_xml">Con XML</option><option value="pendientes_xml">Pendientes XML</option><option value="origen_sii">Origen SII</option><option value="pagadas">Pagadas</option><option value="pendientes_pago">Pendientes pago</option>
          </select>
        </label>
        <label><span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]"><CalendarDays className="h-4 w-4" />Desde</span><input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => { setQuick("custom"); setFrom(event.target.value); }} type="date" value={from} /></label>
        <label><span className="text-sm font-medium text-[#6f6263]">Hasta</span><input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => { setQuick("custom"); setTo(event.target.value); }} type="date" value={to} /></label>
      </div>
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
              <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="bg-white text-left text-xs uppercase text-brand-700"><tr><th className="px-3 py-2">Folio</th><th>Proveedor</th><th>Emision</th><th>Recepcion</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Total</th><th>XML</th><th>Pago</th><th>Acciones</th></tr></thead><tbody>
                {rows.map((invoice) => <tr className="border-t border-[#f0e5df]" key={invoice.id}><td className="px-3 py-3 font-semibold text-brand-900">{invoice.tipoDte}-{invoice.folio}</td><td><p>{invoice.supplier}</p><p className="text-xs text-[#7b6f70]">{invoice.rut}</p>{invoice.sourceType === "sii" ? <p className="text-xs font-semibold text-amber-800">Origen: SII</p> : null}</td><td>{localDate(invoice.issuedAt)}</td><td>{localDate(invoice.receivedAt)}</td><td className="text-right">{formatClp(invoice.net)}</td><td className="text-right">{formatClp(invoice.iva)}</td><td className="text-right font-semibold">{formatClp(invoice.total)}</td><td>{invoice.xmlStatus === "pendiente_xml" ? "Pendiente XML" : invoice.xmlStatus}</td><td>{invoice.paymentStatus}</td><td className="space-x-2 whitespace-nowrap">{invoice.xmlStatus === "pendiente_xml" ? <span className="text-xs text-[#7b6f70]">PDF/XML no disponible</span> : <><a className="font-semibold text-brand-700 hover:underline" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">PDF</a><a className="font-semibold text-brand-700 hover:underline" href={`/api/invoices/${invoice.folio}/xml`}>XML</a></>}<a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${invoice.folio}`}>Detalle</a></td></tr>)}
              </tbody></table></div>
            </article>
          );
        })}
        {!groups.length ? <div className="rounded-md border border-dashed border-[#eadfd9] p-8 text-center text-sm text-[#6f6263]">Sin facturas para el filtro activo.</div> : null}
      </div>
    </section>
  );
}
