import { Clock3, Database, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import { getAuditEvents } from "@/lib/audit/events";

function dateText(value?: string) {
  return value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sin eventos";
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const params = await searchParams;
  const events = await getAuditEvents();
  const errorCount = events.filter((event) => event.state === "error").length;

  return <AppShell>
    <section className="space-y-6">
      <div className="rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Trazabilidad empresarial</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-900">Auditoria y logs</h1>
        <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">Actividad real registrada en `audit_events`: sincronizaciones XML, proveedores, productos, cuentas por pagar y exportaciones financieras.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Eventos auditados", String(events.length), ShieldCheck],
          ["Eventos con error", String(errorCount), Database],
          ["Ultima actividad", dateText(events[0]?.createdAt), Clock3]
        ].map(([label, value, Icon]) => <article className="rounded-lg border border-[#dfe4dd] bg-white p-5 shadow-sm" key={String(label)}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[#667068]">{String(label)}</p><p className="mt-3 text-2xl font-semibold text-brand-900">{String(value)}</p></div><div className="rounded-lg border border-[#dfe4dd] bg-[#f8faf8] p-3"><Icon className="h-5 w-5 text-brand-700" /></div></div>
        </article>)}
      </div>
      <AuditTimeline events={events} initialQuery={params.query ?? ""} />
    </section>
  </AppShell>;
}
