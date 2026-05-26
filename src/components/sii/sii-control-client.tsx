"use client";

import { useMemo, useState } from "react";
import { Download, FileSearch, Mail, UploadCloud } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";

type ResultRow = {
  rowNumber: number;
  tipoDte: string;
  folio: string;
  rutProveedor: string;
  razonSocial: string;
  fecha: string;
  montoTotal: number;
  montoXml: number;
  estado: "xml_recibido" | "falta_xml" | "diferencia_monto" | "proveedor_no_encontrado" | "pendiente_revision";
  dteDocumentId: string | null;
  accion: string;
};

function stateLabel(state: ResultRow["estado"]) {
  if (state === "xml_recibido") return "XML recibido";
  if (state === "falta_xml") return "Falta XML";
  if (state === "diferencia_monto") return "Diferencia monto";
  return "Pendiente revision";
}

function stateClass(state: ResultRow["estado"]) {
  if (state === "xml_recibido") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (state === "diferencia_monto") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

function csv(rows: ResultRow[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    ["fecha", "proveedor", "rut", "tipo_dte", "folio", "monto_sii", "monto_xml", "estado", "accion"],
    ...rows.map((row) => [row.fecha, row.razonSocial, row.rutProveedor, row.tipoDte, row.folio, row.montoTotal, row.montoXml, stateLabel(row.estado), row.accion])
  ].map((row) => row.map(escape).join(";")).join("\n");
}

export function SiiControlClient() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((row) => !needle || `${row.folio} ${row.rutProveedor} ${row.razonSocial} ${row.estado}`.toLowerCase().includes(needle));
  }, [filter, rows]);
  const missing = rows.filter((row) => row.estado === "falta_xml");
  const diff = rows.filter((row) => row.estado === "diferencia_monto");

  async function submit(formData: FormData) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/sii/compare", { body: formData, method: "POST" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage("No se pudo procesar el archivo SII. Revisa formato CSV/XLSX.");
      return;
    }
    setRows(result.results ?? []);
    setMessage(`Cruce listo: ${result.summary?.xmlRecibido ?? 0} recibidos, ${result.summary?.faltanXml ?? 0} faltantes, ${result.summary?.diferenciaMonto ?? 0} con diferencia.`);
  }

  function downloadMissing() {
    const blob = new Blob([csv(missing)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sii-xml-faltantes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[#eadfd9] bg-white p-4"><p className="text-xs text-[#6f6263]">Documentos SII</p><p className="mt-1 text-2xl font-semibold text-brand-900">{rows.length}</p></div>
        <div className="rounded-xl border border-[#eadfd9] bg-white p-4"><p className="text-xs text-[#6f6263]">XML recibidos</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{rows.filter((row) => row.estado === "xml_recibido").length}</p></div>
        <div className="rounded-xl border border-[#eadfd9] bg-white p-4"><p className="text-xs text-[#6f6263]">Faltan XML</p><p className="mt-1 text-2xl font-semibold text-rose-700">{missing.length}</p></div>
        <div className="rounded-xl border border-[#eadfd9] bg-white p-4"><p className="text-xs text-[#6f6263]">Diferencias monto</p><p className="mt-1 text-2xl font-semibold text-amber-700">{diff.length}</p></div>
      </div>

      <form action={submit} className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900"><UploadCloud className="h-5 w-5 text-brand-700" />Importar Registro de Compras SII</h2>
            <p className="mt-1 text-sm text-[#667068]">Sube CSV o XLSX descargado desde SII. El cruce es asistido y no envia correos automaticamente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input accept=".csv,.txt,.xlsx" className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" name="file" required type="file" />
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Comparando..." : "Comparar con XML"}</button>
          </div>
        </div>
        {message ? <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">{message}</p> : null}
      </form>

      <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900"><FileSearch className="h-5 w-5 text-brand-700" />Resultado SII vs XML</h2>
            <p className="mt-1 text-sm text-[#667068]">Estados operativos: XML recibido, falta XML o diferencia de monto.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setFilter(event.target.value)} placeholder="Buscar folio, RUT o proveedor" value={filter} />
            <button className="inline-flex items-center gap-2 rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-900" disabled={!missing.length} onClick={downloadMissing} type="button"><Download className="h-4 w-4" />Exportar faltantes</button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1060px] text-sm">
            <thead className="text-left text-xs uppercase text-brand-700"><tr><th className="py-2">Fecha</th><th>Proveedor</th><th>RUT</th><th>Folio</th><th>Tipo</th><th className="text-right">Monto SII</th><th className="text-right">Monto XML</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr className="border-t border-[#edf2ee]" key={`${row.rowNumber}-${row.rutProveedor}-${row.folio}`}>
                  <td className="py-3">{row.fecha}</td>
                  <td className="font-semibold text-brand-900">{row.razonSocial}</td>
                  <td>{row.rutProveedor}</td>
                  <td>{row.folio}</td>
                  <td>{row.tipoDte}</td>
                  <td className="text-right">{formatClp(row.montoTotal)}</td>
                  <td className="text-right">{row.montoXml ? formatClp(row.montoXml) : "-"}</td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(row.estado)}`}>{stateLabel(row.estado)}</span></td>
                  <td className="max-w-sm text-xs text-[#667068]">
                    {row.dteDocumentId ? <a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${encodeURIComponent(row.folio)}`}>Ver factura</a> : <div><p>{row.accion}</p><button className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700" onClick={() => navigator.clipboard.writeText(`Estimado proveedor, detectamos en SII la factura folio ${row.folio} emitida el ${row.fecha} por ${formatClp(row.montoTotal)}, pero no hemos recibido el XML en dte@lacocinadejavier.cl. Favor reenviar el XML correspondiente.`)} type="button"><Mail className="h-3 w-3" />Copiar reclamo</button></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? <div className="p-8 text-center text-sm text-[#667068]">Sube un Registro de Compras SII para iniciar el control.</div> : null}
        </div>
      </div>
    </section>
  );
}
