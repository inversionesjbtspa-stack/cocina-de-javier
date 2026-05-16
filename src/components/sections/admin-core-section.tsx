import { AppShell } from "@/components/layout/app-shell";

type AdminCoreSectionProps = {
  title: string;
  description: string;
  primaryActions: string[];
  dataModel: string[];
  validationRules: string[];
};

export function AdminCoreSection({
  title,
  description,
  primaryActions,
  dataModel,
  validationRules
}: AdminCoreSectionProps) {
  return (
    <AppShell>
      <section className="space-y-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Nucleo administrativo
          </p>
          <div className="max-w-4xl">
            <h1 className="text-3xl font-semibold text-brand-900">{title}</h1>
            <p className="mt-3 text-base leading-7 text-[#4e5a52]">
              {description}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Operaciones principales
            </h2>
            <ul className="mt-4 space-y-3">
              {primaryActions.map((item) => (
                <li className="text-sm leading-6 text-[#4e5a52]" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Tablas base
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {dataModel.map((item) => (
                <span
                  className="rounded-md bg-[#edf2ee] px-3 py-2 text-sm font-medium text-brand-700"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Validaciones
            </h2>
            <ul className="mt-4 space-y-3">
              {validationRules.map((item) => (
                <li className="text-sm leading-6 text-[#4e5a52]" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
