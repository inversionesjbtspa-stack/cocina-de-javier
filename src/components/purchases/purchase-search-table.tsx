"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clipboard, FileWarning, Search } from "lucide-react";
import { formatClp, formatDate, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function PurchaseSearchTable({ invoices }: { invoices: DtePurchaseInvoice[] }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("todos");
  const [origin, setOrigin] = useState("todos");
  const [xmlStatus, setXmlStatus] = useState("todos");
  const [paymentStatus, setPaymentStatus] = useState("todos");
  const [message, setMessage] = useState<string | null>(null);
  const months = useMemo(() => ["todos", ...Array.from(new Set(invoices.map((invoice) => invoice.fechaEmision.slice(0, 7))))], [invoices]);
  const paymentStatuses = useMemo(
    () => ["todos", ...Array.from(new Set(invoices.map((invoice) => invoice.paymentStatus).filter(Boolean)))],
    [invoices]
  );
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return invoices.filter((invoice) => {
      const products = invoice.items.map((item) => item.description).join(" ");
      const haystack = normalize(`${invoice.razonSocialEmisor} ${invoice.rutEmisor} ${invoice.folio} ${invoice.montoTotal} ${invoice.fechaEmision} ${invoice.tipoDte} ${invoice.sourceLabel ?? ""} ${invoice.paymentStatus} ${products}`);
      const matchesOrigin = origin === "todos" || invoice.source === origin;
      const matchesXmlStatus =
        xmlStatus === "todos" ||
        (xmlStatus === "received" && invoice.xmlStatus !== "missing") ||
        (xmlStatus === "missing" && invoice.xmlStatus === "missing");
      const matchesPayment = paymentStatus === "todos" || invoice.paymentStatus === paymentStatus;
      return (!needle || haystack.includes(needle)) &&
        (month === "todos" || invoice.fechaEmision.startsWith(month)) &&
        matchesOrigin &&
        matchesXmlStatus &&
        matchesPayment;
    });
  }, [invoices, month, origin, paymentStatus, query, xmlStatus]);

  function claimText(invoice: DtePurchaseInvoice) {
    return `Asunto:\n[XML PENDIENTE] Folio ${invoice.folio} - La Cocina de Javier\n\nCuerpo:\nEstimado proveedor,\n\nDetectamos en el Registro de Compras del SII una factura emitida a La Cocina de Javier, pero aun no hemos recibido el XML en nuestro correo:\n\ndte@lacocinadejavier.cl\n\nDocumento pendiente:\n- Folio ${invoice.folio}\n- Fecha ${invoice.fechaEmision}\n- Monto ${formatClp(invoice.montoTotal)}\n\nFavor reenviar el XML correspondiente a dte@lacocinadejavier.cl para poder procesar pago y registro interno.\n\nSaludos,\nLa Cocina de Javier`;
  }

  async function copyClaim(invoice: DtePurchaseInvoice) {
    await navigator.clipboard.writeText(claimText(invoice));
    if (invoice.siiRegistryId) {
      await fetch("/api/sii/claim", {
        body: JSON.stringify({ claimStatus: "copiado", ids: [invoice.siiRegistryId] }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
    }
    setMessage(`Reclamo copiado para folio ${invoice.folio}. Enviar a dte@lacocinadejavier.cl.`);
  }

  return (
    <>
      <div className="mt-5 grid gap-3 lg:grid-cols-6">
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
        <label className="block">
          <span className="text-sm font-medium text-[#5d665f]">Origen</span>
          <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setOrigin(event.target.value)} value={origin}>
            <option value="todos">Todos</option>
            <option value="xml">XML</option>
            <option value="sii">SII pendiente XML</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[#5d665f]">Estado XML</span>
          <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setXmlStatus(event.target.value)} value={xmlStatus}>
            <option value="todos">Todos</option>
            <option value="received">Recibido</option>
            <option value="missing">Pendiente XML</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[#5d665f]">Estado pago</span>
          <select className="mt-2 w-full rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setPaymentStatus(event.target.value)} value={paymentStatus}>
            {paymentStatuses.map((item) => (
              <option key={item} value={item}>{item === "todos" ? "Todos" : item}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button className="rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={() => {
            setQuery("");
            setMonth("todos");
            setOrigin("todos");
            setXmlStatus("todos");
            setPaymentStatus("todos");
          }} type="button">
            Limpiar filtros
          </button>
          <a className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-900" href={`/api/exports/purchases?q=${encodeURIComponent(query)}&month=${encodeURIComponent(month)}&origin=${encodeURIComponent(origin)}&xmlStatus=${encodeURIComponent(xmlStatus)}`}>
            Exportar resultados
          </a>
        </div>
      </div>
      {message ? (
        <div className="mt-4 rounded-md border border-[#dfe4dd] bg-[#f8faf8] px-4 py-3 text-sm text-brand-900">
          {message}
        </div>
      ) : null}

      <div className="mt-5 max-h-[560px] overflow-auto rounded-lg border border-[#e6ebe5]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 bg-[#f8faf8]">
            <tr className="border-b border-[#dfe4dd] text-left text-xs uppercase text-brand-700">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Razon social</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3 text-right">Neto</th>
              <th className="px-4 py-3 text-right">IVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado XML</th>
              <th className="px-4 py-3">Estado pago</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((invoice) => {
              const isPendingXml = invoice.xmlStatus === "missing" || invoice.source === "sii";
              return (
                <tr className="border-b border-[#edf2ee] bg-white hover:bg-[#f8faf8]" key={invoice.normalizedKey ?? `${invoice.rutEmisor}-${invoice.tipoDte}-${invoice.folio}`}>
                  <td className="px-4 py-3 text-[#4e5a52]">{formatDate(invoice.fechaEmision)}</td>
                  <td className="px-4 py-3 font-medium text-brand-900">
                    <a className="hover:underline" href={`/proveedores?q=${encodeURIComponent(invoice.razonSocialEmisor)}`}>{invoice.razonSocialEmisor}</a>
                    <p className="mt-1 text-xs font-normal text-[#667068]">{invoice.rutEmisor}</p>
                  </td>
                  <td className="px-4 py-3 text-[#4e5a52]">
                    <a className="hover:underline" href={`/facturas?folio=${encodeURIComponent(invoice.folio)}`}>{invoice.documentType} {invoice.folio}</a>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isPendingXml ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                      {invoice.source === "manual" ? "Manual" : isPendingXml ? "SII" : "XML"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">{formatClp(invoice.montoNeto)}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#4e5a52]">{formatClp(invoice.iva)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-700">{formatClp(invoice.montoTotal)}</td>
                  <td className="px-4 py-3 text-[#4e5a52]">
                    {isPendingXml ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        <FileWarning className="h-3.5 w-3.5" />
                        Pendiente XML
                      </span>
                    ) : "Recibido"}
                  </td>
                  <td className="px-4 py-3 text-[#4e5a52]">{invoice.tipoDte === "61" ? "Nota credito" : invoice.paymentStatus}</td>
                  <td className="px-4 py-3">
                    {isPendingXml ? (
                      <div className="space-y-2">
                        <p className="text-xs text-[#667068]">PDF no disponible</p>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                          onClick={() => copyClaim(invoice)}
                          type="button"
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                          Copiar reclamo
                        </button>
                        <a className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-[#edf2ee]" href="/tesoreria#nomina-pagos">
                          {invoice.accountsPayableId ? "Ver en Tesoreria" : "Tesoreria automatica pendiente"}
                        </a>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <a className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-900" href={`/api/invoices/${invoice.folio}/pdf`} target="_blank">
                          Ver
                        </a>
                        <a className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-[#edf2ee]" href={`/api/invoices/${invoice.folio}/pdf?download=1`}>
                          Descargar
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667068]">Sin compras para el filtro activo.</div>
        ) : null}
      </div>
    </>
  );
}
