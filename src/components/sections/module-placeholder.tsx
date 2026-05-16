import { AppShell } from "@/components/layout/app-shell";

type ModulePlaceholderProps = {
  title: string;
  description: string;
  items: string[];
};

export function ModulePlaceholder({
  title,
  description,
  items
}: ModulePlaceholderProps) {
  return (
    <AppShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Modulo ERP
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-900">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[#4e5a52]">
            {description}
          </p>
        </div>

        <div className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Alcance inicial
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <li
                className="rounded-md border border-[#e6ebe5] px-4 py-3 text-sm text-[#4e5a52]"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
