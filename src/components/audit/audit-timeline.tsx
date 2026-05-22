"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Search } from "lucide-react";
import type { AuditEventView } from "@/lib/audit/events";

function dateText(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function stateClass(state: AuditEventView["state"]) {
  if (state === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (state === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function AuditTimeline({ events, initialQuery = "" }: { events: AuditEventView[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [module, setModule] = useState("");
  const [actor, setActor] = useState("");
  const [state, setState] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const modules = useMemo(() => [...new Set(events.map((event) => event.module))].sort(), [events]);
  const actors = useMemo(() => [...new Set(events.map((event) => event.actor))].sort(), [events]);
  const filtered = useMemo(() => events.filter((event) => {
    const needle = query.trim().toLowerCase();
    const haystack = [
      event.eventType,
      event.action,
      event.module,
      event.actor,
      event.entityType,
      event.entityId,
      event.error,
      JSON.stringify(event.afterData ?? {})
    ].join(" ").toLowerCase();
    const day = event.createdAt.slice(0, 10);
    return (!needle || haystack.includes(needle)) &&
      (!module || event.module === module) &&
      (!actor || event.actor === actor) &&
      (!state || event.state === state) &&
      (!from || day >= from) &&
      (!to || day <= to);
  }), [actor, events, from, module, query, state, to]);

  const exportQuery = new URLSearchParams({ actor, from, module, query, state, to }).toString();

  return <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-brand-900">Actividad auditada</h2>
        <p className="mt-1 text-sm text-[#667068]">Eventos persistidos en Supabase con detalle tecnico expandible.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="inline-flex items-center gap-2 rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-900" href={`/api/audit/export?format=csv&${exportQuery}`}><Download className="h-4 w-4" />Excel</a>
        <a className="inline-flex items-center gap-2 rounded-md border border-[#dfe4dd] px-3 py-2 text-sm font-semibold text-brand-900" href={`/api/audit/export?format=pdf&${exportQuery}`} target="_blank"><Download className="h-4 w-4" />PDF</a>
      </div>
    </div>
    <div className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_repeat(5,1fr)]">
      <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#667068]" /><input className="w-full rounded-md border border-[#dfe4dd] py-2 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar accion, folio, RUT, entidad" value={query} /></label>
      <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setModule(event.target.value)} value={module}><option value="">Todo modulo</option>{modules.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setActor(event.target.value)} value={actor}><option value="">Todo usuario</option>{actors.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setState(event.target.value)} value={state}><option value="">Todo estado</option><option value="ok">OK</option><option value="warning">Atencion</option><option value="error">Error</option></select>
      <input className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
      <input className="rounded-md border border-[#dfe4dd] px-3 py-2 text-sm" onChange={(event) => setTo(event.target.value)} type="date" value={to} />
    </div>
    <div className="mt-5 space-y-3">
      {filtered.map((event) => <details className="rounded-lg border border-[#e6ebe5] bg-[#f8faf8] p-4" key={event.id}>
        <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-brand-900">{dateText(event.createdAt)} - {event.action}</p>
            <p className="mt-1 text-sm text-[#5d665f]">{event.actor} / {event.module} / {event.entityType}{event.entityId ? ` / ${event.entityId}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass(event.state)}`}>{event.state === "ok" ? "OK" : event.state === "warning" ? "Atencion" : "Error"}</span>
            <ChevronDown className="h-4 w-4 text-[#667068]" />
          </div>
        </summary>
        <div className="mt-4 grid gap-3 border-t border-[#e6ebe5] pt-4 text-sm text-[#5d665f] lg:grid-cols-2">
          <div><p><b>Evento:</b> {event.eventType}</p><p><b>Rol:</b> {event.actorRole || "sistema"}</p><p><b>Request:</b> {event.requestId || "No informado"}</p><p><b>Error:</b> {event.error || "Sin error"}</p></div>
          <div><p><b>IP:</b> {event.ipAddress || "No informada"}</p><p><b>User agent:</b> {event.userAgent || "No informado"}</p></div>
          <pre className="max-h-72 overflow-auto rounded-md bg-white p-3 text-xs text-brand-900 lg:col-span-2">{JSON.stringify({ before: event.beforeData, after: event.afterData }, null, 2)}</pre>
        </div>
      </details>)}
      {!filtered.length ? <div className="rounded-lg border border-dashed border-[#dfe4dd] p-8 text-center text-sm text-[#667068]">No hay eventos reales para los filtros aplicados.</div> : null}
    </div>
  </article>;
}
