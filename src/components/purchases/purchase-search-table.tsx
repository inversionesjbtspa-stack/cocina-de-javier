"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { formatClp, formatDate, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function PurchaseSearchTable({ invoices }: { invoices: DtePurchaseInvoice[] }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("todos");
  const months = useMemo(() => ["todos", ...Array.from(new Set(invoices.map((invoice) => invoice.fechaEmision.slice(0, 7))))], [invoices]);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return invoices.filter((invoice) => {
      const products = invoice.items.map((item) => item.description).join(" ");
      const haystack = normalize(`${invoice.razonSocialEmisor} ${invoice.rutEmisor} ${invoice.folio} ${invoice.montoTotal} ${invoice.fechaEmision} ${products}`);
      return (!needle || haystack.includes(needle)) && (month === "todos" || invoice.fechaEmision.startsWith(month));
    });
  }, [invoices, month, query]);

  return (
    <>
      <div className="mt-5 grid gap-3 lg:grid-cols-5">
        <label className="block lg:col-span-2">
          <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
            <Search className="h-4 w-4" />
            Busqueda rapida
          </span>
          <input
            className="mt-2 w-full rounded-md border border-[#dfe4dd] bg-white px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Folio, proveedor, producto, monto o fecha"
            type="search"
            value={query}
          />
        </label>
        <label className="block">
          <span className="flex items-center gap-2 text-sm font-medium text-[#5d665f]">
            <CalendarDays className="h-4 w-4" />
            Mes
          </span>
          <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setMonth(event.target.value)} value={month}>
            {months.map((item) => (
              <option key={item} value={item}>{item === "todos" ? "Todos" : item}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          <a className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50" href="/compras">
            Limpiar filtros
          </a>
          <a className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-900" href={`/api/exports/purchases?q=${encodeURIComponent(query)}&month=${encodeURIComponent(month)}`}>
            Exportar resultados
          </a>
        </div>
      </div>

      <div className="mt-5 max-h-[560px] overflow-auto rounded-lg border border-[#e6ebe5]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 bg-[#f8faf8]">
            <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Razon social</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3 text-right">Neto</th>
              <th className="px-4 py-3 text-right">IVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((invoice) => (
              <tr className="border-b border-[#edf2ee] bg-white hover:bg-[#f8faf8]" key={invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}>
                <td className="px-4 py-3 text-[#4e5a52]">{formatDate(invoice.fechaEmision)}</td>
                <td className="px-4 py-3 font-medium text-brand-900">
                  <a className="hover:underline" href={`/proveedores?q=${encodeURIComponent(invoice.razonSocialEmisor)}`}>{invoice.razonSocialEmisor}</a>
                </td>
                <td className="px-4 py-3 text-[#4e5a52]">
                  <a className="hover:underline" href={`/facturas?folio=${encodeURIComponent(invoice.folio)}`}>{invoice.documentType} {invoice.folio}</a>
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">{formatClp(invoice.montoNeto)}</td>
                <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">{formatClp(invoice.iva)}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-700">{formatClp(invoice.montoTotal)}</td>
                <td className="px-4 py-3 text-[#4e5a52]">{invoice.tipoDte === "61" ? "Nota credito" : invoice.paymentStatus}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-900" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">
                      Ver
                    </a>
                    <a className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-[#edf2ee]" href={`/api/invoices/${invoice.folio}/pdf?download=1`}>
                      Descargar
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667068]">Sin compras para el filtro activo.</div>
        ) : null}
      </div>
    </>
  );
}
