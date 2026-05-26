"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSearch, Mail, UploadCloud } from "lucide-react";
import { formatClp } from "@/lib/dte/purchases-data";

type ResultRow = {
  id: string;
  periodo: string;
  tipoDte: string;
  folio: string;
  rutEmisor: string;
  razonSocial: string;
  supplierEmail: string | null;
  fechaEmision: string;
  montoNeto: number;
  iva: number;
  montoTotal: number;
  montoXml: number;
  estadoXml: "xml_recibido" | "falta_xml" | "diferencia_monto" | "pendiente_revision";
  claimStatus: "pendiente" | "copiado" | "enviado_manualmente" | "resuelto" | "ignorado";
  dteDocumentId: string | null;
  xmlReceivedAt: string | null;
  sourceFile: string | null;
};

type Summary = {
  total: number;
  xmlRecibidos: number;
  faltanXml: number;
  diferenciasMonto: number;
  proveedoresAReclamar: number;
  montoSinXml: number;
  documentosResueltos: number;
};

type SummaryComparison = {
  id: string;
  periodo: string;
  rutEmpresa: string;
  tipoDocumento: string;
  documentosSii: number;
  documentosXml: number;
  diferenciaDocumentos: number;
  montoTotalSii: number;
  montoXml: number;
  diferenciaMonto: number;
  estado: "ok" | "faltan_documentos" | "diferencia_monto" | "requiere_detalle";
  accionRecomendada: string;
};

type SummaryTotals = {
  documentosSii: number;
  documentosXml: number;
  diferenciaDocumentos: number;
  diferenciaMonto: number;
  tiposConDiferencias: number;
};

const emptySummary: Summary = {
  diferenciasMonto: 0,
  documentosResueltos: 0,
  faltanXml: 0,
  montoSinXml: 0,
  proveedoresAReclamar: 0,
  total: 0,
  xmlRecibidos: 0
};

const emptySummaryTotals: SummaryTotals = {
  diferenciaDocumentos: 0,
  diferenciaMonto: 0,
  documentosSii: 0,
  documentosXml: 0,
  tiposConDiferencias: 0
};

function stateLabel(state: ResultRow["estadoXml"]) {
  if (state === "xml_recibido") return "XML recibido";
  if (state === "falta_xml") return "Falta XML";
  if (state === "diferencia_monto") return "Diferencia monto";
  return "Pendiente revision";
}

function stateClass(state: ResultRow["estadoXml"]) {
  if (state === "xml_recibido") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (state === "diferencia_monto") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

function summaryStateLabel(state: SummaryComparison["estado"]) {
  if (state === "ok") return "OK";
  if (state === "faltan_documentos") return "Faltan documentos";
  if (state === "diferencia_monto") return "Diferencia monto";
  return "Requiere detalle";
}

function summaryStateClass(state: SummaryComparison["estado"]) {
  if (state === "ok") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (state === "diferencia_monto") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

function csv(rows: ResultRow[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    ["periodo", "fecha", "proveedor", "rut", "tipo_dte", "folio", "monto_sii", "monto_xml", "estado_xml", "estado_reclamo"],
    ...rows.map((row) => [row.periodo, row.fechaEmision, row.razonSocial, row.rutEmisor, row.tipoDte, row.folio, row.montoTotal, row.montoXml, stateLabel(row.estadoXml), row.claimStatus])
  ].map((row) => row.map(escape).join(";")).join("\n");
}

function claimText(provider: string, rows: ResultRow[]) {
  const list = rows
    .map((row) => `- Folio ${row.folio}, fecha ${row.fechaEmision || "sin fecha"}, monto ${formatClp(row.montoTotal)}`)
    .join("\n");
  return `Estimado proveedor,\n\nDetectamos en el Registro de Compras del SII documentos emitidos a La Cocina de Javier, pero no hemos recibido los XML correspondientes en nuestro correo:\n\ndte@lacocinadejavier.cl\n\nDocumentos pendientes:\n${list}\n\nFavor reenviar los XML correspondientes a dte@lacocinadejavier.cl para poder procesar pago y registro interno.\n\nSaludos,\nLa Cocina de Javier`;
}

export function SiiControlClient() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [monthly, setMonthly] = useState<SummaryComparison[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<SummaryTotals>(emptySummaryTotals);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [technicalDetail, setTechnicalDetail] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [estadoXml, setEstadoXml] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const [periodo, setPeriodo] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/sii/compare", { cache: "no-store" });
    const result = await response.json();
    setTechnicalDetail(null);
    if (response.ok) {
      setRows(result.results ?? []);
      setSummary(result.summary ?? emptySummary);
      setMonthly(result.summaryComparisons ?? []);
      setMonthlyTotals(result.summaryTotals ?? emptySummaryTotals);
    } else if (result.error === "missing_sii_purchase_registry_migration") {
      setMessage("Falta aplicar la migracion sii_purchase_registry en Supabase.");
      setTechnicalDetail(result.detail ?? result);
    } else if (result.error === "missing_sii_purchase_summary_migration") {
      setMessage("Falta aplicar la migracion sii_purchase_summary en Supabase.");
      setTechnicalDetail(result.detail ?? result);
    } else {
      setMessage(errorMessage(result.error));
      setTechnicalDetail(result.detail ?? result);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const periods = useMemo(() => [...new Set(rows.map((row) => row.periodo).filter(Boolean))].sort().reverse(), [rows]);
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = `${row.folio} ${row.rutEmisor} ${row.razonSocial} ${row.estadoXml} ${row.claimStatus} ${row.montoTotal}`.toLowerCase();
      return (!needle || haystack.includes(needle)) &&
        (!estadoXml || row.estadoXml === estadoXml) &&
        (!claimStatus || row.claimStatus === claimStatus) &&
        (!periodo || row.periodo === periodo);
    });
  }, [claimStatus, estadoXml, filter, periodo, rows]);
  const missing = rows.filter((row) => row.estadoXml === "falta_xml");
  const providers = useMemo(() => {
    const grouped = new Map<string, { rut: string; proveedor: string; rows: ResultRow[]; total: number; oldest: string }>();
    for (const row of missing) {
      const current = grouped.get(row.rutEmisor) ?? { oldest: row.fechaEmision, proveedor: row.razonSocial, rows: [], rut: row.rutEmisor, total: 0 };
      current.rows.push(row);
      current.total += row.montoTotal;
      if (row.fechaEmision && (!current.oldest || row.fechaEmision < current.oldest)) current.oldest = row.fechaEmision;
      grouped.set(row.rutEmisor, current);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [missing]);

  async function submit(formData: FormData) {
    setBusy(true); setMessage(""); setTechnicalDetail(null);
    const response = await fetch("/api/sii/compare", { body: formData, method: "POST" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(errorMessage(result.error));
      setTechnicalDetail(result.detail ?? result);
      return;
    }
    setRows(result.results ?? []);
    setSummary(result.summary ?? emptySummary);
    setMonthly(result.summaryComparisons ?? []);
    setMonthlyTotals(result.summaryTotals ?? emptySummaryTotals);
    const imported = result.imported;
    const importedSummary = result.importedSummary;
    setMessage(result.importMode === "summary"
      ? `Resumen importado correctamente: ${importedSummary?.leidos ?? 0} tipos leidos, ${importedSummary?.nuevos ?? 0} nuevos, ${importedSummary?.actualizados ?? 0} actualizados. Para identificar folios faltantes sube el detalle del Registro de Compras.`
      : `Importacion acumulativa lista: ${imported?.leidos ?? 0} leidos, ${imported?.rowsPersistidas ?? 0} persistidos, ${imported?.duplicadosIgnorados ?? 0} duplicados internos ignorados, ${imported?.faltanXml ?? 0} faltan XML, ${imported?.rowErrors ?? 0} errores de fila.`);
    if (result.importErrors?.length) setTechnicalDetail({ importErrors: result.importErrors });
  }

  async function markClaim(rutEmisor: string, status: ResultRow["claimStatus"]) {
    const response = await fetch("/api/sii/claim", {
      body: JSON.stringify({ claimStatus: status, rutEmisor }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    if (response.ok) await load();
  }

  async function copyClaim(provider: string, rutEmisor: string, providerRows: ResultRow[]) {
    await navigator.clipboard.writeText(claimText(provider, providerRows));
    await markClaim(rutEmisor, "copiado");
  }

  function download(name: string, exportRows: ResultRow[]) {
    const blob = new Blob([csv(exportRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const kpis = [
    ["Documentos SII", summary.total, ""],
    ["XML recibidos", summary.xmlRecibidos, "xml_recibido"],
    ["Faltan XML", summary.faltanXml, "falta_xml"],
    ["Diferencias monto", summary.diferenciasMonto, "diferencia_monto"],
    ["Proveedores a reclamar", summary.proveedoresAReclamar, "falta_xml"],
    ["Monto sin XML", formatClp(summary.montoSinXml), "falta_xml"],
    ["Resueltos", summary.documentosResueltos, ""]
  ];

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        {kpis.map(([label, value, state]) => (
          <button className="rounded-xl border border-[#eadfd9] bg-white p-4 text-left shadow-sm transition hover:bg-brand-50" key={label} onClick={() => setEstadoXml(String(state))} type="button">
            <p className="text-xs text-[#6f6263]">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-900">{value}</p>
          </button>
        ))}
      </div>

      <form action={submit} className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900"><UploadCloud className="h-5 w-5 text-brand-700" />Importar Registro de Compras SII</h2>
            <p className="mt-1 text-sm text-[#667068]">Soporta CSV/XLSX detalle y resumen RCV. El detalle cruza por folio; el resumen controla totales mensuales agregados.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input accept=".csv,.txt,.xlsx" className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" name="file" required type="file" />
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Importando..." : "Importar y cruzar"}</button>
          </div>
        </div>
        {message ? <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">{message}</p> : null}
        {technicalDetail ? (
          <details className="mt-3 rounded-md border border-[#eadfd9] bg-[#fffdfb] px-3 py-2 text-xs text-[#667068]">
            <summary className="cursor-pointer font-semibold text-brand-900">Detalle tecnico para administrador</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify(technicalDetail, null, 2)}</pre>
          </details>
        ) : null}
      </form>

      <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">Control por resumen mensual</h2>
            <p className="mt-1 text-sm text-[#667068]">Comparacion agregada entre RCV resumen SII y XML recibidos. Para identificar folios exactos se requiere subir el detalle.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-[#667068]">Docs SII</p><p className="font-semibold text-brand-900">{monthlyTotals.documentosSii}</p></div>
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-[#667068]">XML recibidos</p><p className="font-semibold text-brand-900">{monthlyTotals.documentosXml}</p></div>
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-[#667068]">Dif. docs</p><p className="font-semibold text-brand-900">{monthlyTotals.diferenciaDocumentos}</p></div>
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-[#667068]">Dif. monto</p><p className="font-semibold text-brand-900">{formatClp(monthlyTotals.diferenciaMonto)}</p></div>
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-[#667068]">Tipos con dif.</p><p className="font-semibold text-brand-900">{monthlyTotals.tiposConDiferencias}</p></div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs uppercase text-brand-700"><tr><th className="py-2">Periodo</th><th>Tipo DTE</th><th className="text-right">Docs SII</th><th className="text-right">XML recibidos</th><th className="text-right">Dif. docs</th><th className="text-right">Monto SII</th><th className="text-right">Monto XML</th><th className="text-right">Dif. monto</th><th>Estado</th><th>Accion recomendada</th></tr></thead>
            <tbody>
              {monthly.map((row) => (
                <tr className="border-t border-[#edf2ee]" key={row.id}>
                  <td className="py-3">{row.periodo}</td>
                  <td>{row.tipoDocumento}</td>
                  <td className="text-right">{row.documentosSii}</td>
                  <td className="text-right">{row.documentosXml}</td>
                  <td className="text-right">{row.diferenciaDocumentos}</td>
                  <td className="text-right">{formatClp(row.montoTotalSii)}</td>
                  <td className="text-right">{formatClp(row.montoXml)}</td>
                  <td className="text-right">{formatClp(row.diferenciaMonto)}</td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${summaryStateClass(row.estado)}`}>{summaryStateLabel(row.estado)}</span></td>
                  <td className="max-w-[260px] text-xs text-[#667068]">{row.accionRecomendada}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!monthly.length ? <div className="p-8 text-center text-sm text-[#667068]">Sin resumen mensual importado. Sube el archivo RCV_RESUMEN para ver control ejecutivo agregado.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900"><Mail className="h-5 w-5 text-brand-700" />Proveedores a reclamar XML</h2>
            <p className="mt-1 text-sm text-[#667068]">Agrupacion por proveedor con folios pendientes y monto sin XML.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-900" disabled={!missing.length} onClick={() => download("sii-xml-faltantes.csv", missing)} type="button"><Download className="h-4 w-4" />Exportar faltantes</button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {providers.slice(0, 10).map((provider) => (
            <div className="rounded-xl border border-[#eadfd9] bg-[#fffdfb] p-4" key={provider.rut}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold text-brand-900">{provider.proveedor}</p>
                  <p className="text-xs text-[#667068]">{provider.rut} / {provider.rows.length} facturas / {formatClp(provider.total)} / antigua {provider.oldest || "-"}</p>
                  <p className="mt-1 text-xs text-[#667068]">Email: {provider.rows.find((row) => row.supplierEmail)?.supplierEmail ?? "No registrado"}</p>
                  <p className="mt-2 text-xs text-[#667068]">Folios: {provider.rows.slice(0, 8).map((row) => row.folio).join(", ")}{provider.rows.length > 8 ? "..." : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-md bg-brand-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => copyClaim(provider.proveedor, provider.rut, provider.rows)} type="button">Copiar reclamo</button>
                  <button className="rounded-md border border-[#dfe4dd] px-3 py-2 text-xs font-semibold text-brand-900" onClick={() => markClaim(provider.rut, "enviado_manualmente")} type="button">Marcar enviado</button>
                  <button className="rounded-md border border-[#dfe4dd] px-3 py-2 text-xs font-semibold text-brand-900" onClick={() => markClaim(provider.rut, "resuelto")} type="button">Resolver</button>
                </div>
              </div>
            </div>
          ))}
          {!providers.length ? <div className="rounded-xl border border-dashed border-[#dfe4dd] p-6 text-sm text-[#667068]">No hay proveedores pendientes de reclamo.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900"><FileSearch className="h-5 w-5 text-brand-700" />Base historica SII vs XML</h2>
            <p className="mt-1 text-sm text-[#667068]">Tabla acumulativa persistida en Supabase.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setPeriodo(event.target.value)} value={periodo}><option value="">Todo periodo</option>{periods.map((item) => <option key={item}>{item}</option>)}</select>
            <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setEstadoXml(event.target.value)} value={estadoXml}><option value="">Todo estado XML</option><option value="xml_recibido">XML recibido</option><option value="falta_xml">Falta XML</option><option value="diferencia_monto">Diferencia monto</option></select>
            <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setClaimStatus(event.target.value)} value={claimStatus}><option value="">Todo reclamo</option><option value="pendiente">Pendiente</option><option value="copiado">Copiado</option><option value="enviado_manualmente">Enviado manualmente</option><option value="resuelto">Resuelto</option><option value="ignorado">Ignorado</option></select>
            <input className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setFilter(event.target.value)} placeholder="Folio, RUT, proveedor o monto" value={filter} />
            <button className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-900" onClick={() => { setFilter(""); setEstadoXml(""); setClaimStatus(""); setPeriodo(""); }} type="button">Limpiar</button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1220px] text-sm">
            <thead className="text-left text-xs uppercase text-brand-700"><tr><th className="py-2">Periodo</th><th>Fecha</th><th>Proveedor</th><th>RUT</th><th>Folio</th><th>Tipo</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Monto SII</th><th className="text-right">Monto XML</th><th>Estado XML</th><th>Reclamo</th><th>Accion</th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr className="border-t border-[#edf2ee]" key={row.id}>
                  <td className="py-3">{row.periodo}</td>
                  <td>{row.fechaEmision}</td>
                  <td className="font-semibold text-brand-900">{row.razonSocial}</td>
                  <td>{row.rutEmisor}</td>
                  <td>{row.folio}</td>
                  <td>{row.tipoDte}</td>
                  <td className="text-right">{formatClp(row.montoNeto)}</td>
                  <td className="text-right">{formatClp(row.iva)}</td>
                  <td className="text-right">{formatClp(row.montoTotal)}</td>
                  <td className="text-right">{row.montoXml ? formatClp(row.montoXml) : "-"}</td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(row.estadoXml)}`}>{stateLabel(row.estadoXml)}</span></td>
                  <td>{row.claimStatus}</td>
                  <td>{row.dteDocumentId ? <a className="font-semibold text-brand-700 hover:underline" href={`/facturas?folio=${encodeURIComponent(row.folio)}`}>Ver factura</a> : <button className="font-semibold text-brand-700" onClick={() => copyClaim(row.razonSocial, row.rutEmisor, [row])} type="button">Copiar reclamo</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? <div className="p-8 text-center text-sm text-[#667068]">Sin documentos para los filtros aplicados.</div> : null}
        </div>
      </div>
    </section>
  );
}

function errorMessage(error: string) {
  const messages: Record<string, string> = {
    missing_sii_purchase_registry_migration: "Falta aplicar la migracion sii_purchase_registry en Supabase.",
    missing_sii_purchase_summary_migration: "Falta aplicar la migracion sii_purchase_summary en Supabase.",
    no_supported_rows: "No se detectaron columnas reconocibles del SII. Revisa si el archivo esta vacio o si corresponde a otro reporte.",
    sii_registry_query_failed: "No se pudo leer la base historica SII. Revisa permisos o estructura de tabla."
  };
  return messages[error] ?? `No se pudo importar el archivo SII: ${error}`;
}
