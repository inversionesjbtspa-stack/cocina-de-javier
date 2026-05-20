"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
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
  const initial = candidates.filter((candidate) => candidate.ok).slice(0, 20).map((candidate) => candidate.invoice.folio);
  const [selected, setSelected] = useState<string[]>(initial);

  const selectedRows = useMemo(
    () => candidates.filter((candidate) => selected.includes(candidate.invoice.folio)),
    [candidates, selected]
  );
  const invalidSelected = selectedRows.filter((candidate) => !candidate.ok);
  const total = selectedRows.reduce((sum, row) => sum + row.invoice.montoTotal, 0);
  const exportUrl = `/api/payment-template?folios=${encodeURIComponent(selected.join(","))}`;

  function toggle(folio: string) {
    setSelected((current) =>
      current.includes(folio) ? current.filter((item) => item !== folio) : [...current, folio]
    );
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
          {invalidSelected.length ? (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-[#d8d0cc] px-4 py-2 text-sm font-semibold text-white"
              disabled
              type="button"
            >
              <AlertTriangle className="h-4 w-4" />
              Faltan datos
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
            {candidates.map((candidate) => (
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
      </div>
    </section>
  );
}
