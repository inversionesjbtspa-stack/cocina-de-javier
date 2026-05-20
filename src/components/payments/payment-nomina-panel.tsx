"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, FileSpreadsheet, Search } from "lucide-react";
import { formatClp, formatDate, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";

type PaymentCandidate = {
  alerts: string[];
  bankAccount: string;
  bankCode: string;
  bankName: string;
  email: string;
  invoice: DtePurchaseInvoice;
  ok: boolean;
  supplierName: string;
};

export function PaymentNominaPanel({ candidates }: { candidates: PaymentCandidate[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState("30");
  const [status, setStatus] = useState("todos");

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    const now = new Date();
    const maxDate = new Date();
    if (quick !== "custom") maxDate.setDate(now.getDate() + Number(quick));

    return candidates.filter((candidate) => {
      const due = new Date(`${candidate.invoice.fechaVencimiento}T00:00:00`);
      const matchesQuick = quick === "custom" || due <= maxDate;
      const matchesFrom = !from || candidate.invoice.fechaVencimiento >= from;
      const matchesTo = !to || candidate.invoice.fechaVencimiento <= to;
      const haystack = [
        candidate.invoice.folio,
        candidate.invoice.rutEmisor,
        candidate.supplierName,
        candidate.invoice.montoTotal,
        candidate.email,
        candidate.bankName
      ]
        .join(" ")
        .toLowerCase();
      const matchesStatus =
        status === "todos" ||
        (status === "validas" && candidate.ok) ||
        (status === "incompletas" && !candidate.ok) ||
        (status === "vencidas" && due < now);
      return matchesQuick && matchesFrom && matchesTo && matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [candidates, from, query, quick, status, to]);

  const selectedRows = useMemo(
    () => filtered.filter((candidate) => selected.includes(candidate.invoice.folio)),
    [filtered, selected]
  );
  const invalidSelected = selectedRows.filter((candidate) => !candidate.ok);
  const total = selectedRows.reduce((sum, row) => sum + row.invoice.montoTotal, 0);
  const exportUrl = `/api/payment-template?folios=${encodeURIComponent(selected.join(","))}`;

  function toggle(folio: string) {
    setSelected((current) =>
      current.includes(folio) ? current.filter((item) => item !== folio) : [...current, folio]
    );
  }

  function selectAll() {
    setSelected(filtered.filter((candidate) => candidate.ok).map((candidate) => candidate.invoice.folio));
  }

  return (
    <section className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm" id="nomina-pagos">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Nomina de pago Santander</h2>
          <p className="mt-1 text-sm text-[#6f6263]">
            Seleccion real de facturas. El export usa el Template Pagos JESUS.xlsx como base.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-[#eadfd9] bg-brand-50 px-3 py-2 text-sm">
            <span className="text-[#6f6263]">Seleccionado </span>
            <span className="font-semibold text-brand-900">{formatClp(total)}</span>
          </div>
          <button className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={selectAll} type="button">
            Seleccionar todo
          </button>
          <button className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setSelected([])} type="button">
            Quitar seleccion
          </button>
          {invalidSelected.length || selected.length === 0 ? (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-[#d8d0cc] px-4 py-2 text-sm font-semibold text-white"
              disabled
              type="button"
            >
              <AlertTriangle className="h-4 w-4" />
              {selected.length === 0 ? "Seleccione facturas" : "Faltan datos"}
            </button>
          ) : (
            <a
              className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
              href={exportUrl}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Santander
            </a>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-6">
        <label className="block lg:col-span-2">
          <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
            <Search className="h-4 w-4" />
            Buscar
          </span>
          <input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Folio, proveedor, RUT o monto" type="search" value={query} />
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Periodo</span>
          <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setQuick(event.target.value)} value={quick}>
            <option value="0">Hoy</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
            <option value="custom">Rango</option>
          </select>
        </label>
        <label>
          <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
            <CalendarDays className="h-4 w-4" />
            Desde
          </span>
          <input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Hasta</span>
          <input className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setTo(event.target.value)} type="date" value={to} />
        </label>
        <label>
          <span className="text-sm font-medium text-[#6f6263]">Estado</span>
          <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="todos">Todos</option>
            <option value="validas">Validas</option>
            <option value="incompletas">Incompletas</option>
            <option value="vencidas">Vencidas</option>
          </select>
        </label>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-[#eadfd9]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-brand-700">
            <tr>
              <th className="px-3 py-3 text-left">Sel.</th>
              <th className="px-3 py-3 text-left">Factura</th>
              <th className="px-3 py-3 text-left">Proveedor</th>
              <th className="px-3 py-3 text-left">Banco</th>
              <th className="px-3 py-3 text-left">Cuenta</th>
              <th className="px-3 py-3 text-left">Email</th>
              <th className="px-3 py-3 text-right">Monto</th>
              <th className="px-3 py-3 text-left">Validacion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((candidate) => (
              <tr className="border-t border-[#f0e5df]" key={candidate.invoice.normalizedKey}>
                <td className="px-3 py-3">
                  <input
                    checked={selected.includes(candidate.invoice.folio)}
                    className="h-4 w-4 accent-brand-700"
                    onChange={() => toggle(candidate.invoice.folio)}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-brand-900">{candidate.invoice.folio}</p>
                  <p className="text-xs text-[#7b6f70]">{formatDate(candidate.invoice.fechaVencimiento)}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-brand-900">{candidate.supplierName}</p>
                  <p className="text-xs text-[#7b6f70]">{candidate.invoice.rutEmisor}</p>
                </td>
                <td className="px-3 py-3">{candidate.bankName || candidate.bankCode || "Sin banco"}</td>
                <td className="px-3 py-3">{candidate.bankAccount || "Sin cuenta"}</td>
                <td className="px-3 py-3">{candidate.email || "Sin email"}</td>
                <td className="px-3 py-3 text-right font-semibold text-brand-900">
                  {formatClp(candidate.invoice.montoTotal)}
                </td>
                <td className="px-3 py-3">
                  {candidate.ok ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Listo
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      {candidate.alerts.join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6f6263]">Sin facturas para el filtro activo.</div>
        ) : null}
      </div>
    </section>
  );
}
