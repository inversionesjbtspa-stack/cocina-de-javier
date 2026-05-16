import { AppShell } from "@/components/layout/app-shell";

export default function RecursosHumanosPage() {
  return (
    <AppShell>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">
            Recursos Humanos
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Personal, documentos, anticipos, turnos extras y exportaciones.
          </p>
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <div className="flex flex-wrap gap-3">
            <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white">
              Agregar nuevo personal
            </button>
            <button className="rounded-md border border-[#dfe4dd] px-4 py-2 text-sm font-semibold text-brand-700">
              Exportar lista Excel
            </button>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-3">
          {["Ficha personal", "Anticipos", "Turnos extras"].map((title) => (
            <article className="rounded-lg border border-[#dfe4dd] bg-white p-5" key={title}>
              <h2 className="text-base font-semibold text-brand-900">{title}</h2>
              <p className="mt-2 text-sm text-[#5d665f]">
                Historial por persona, dia, mes y año en CLP sin decimales.
              </p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
