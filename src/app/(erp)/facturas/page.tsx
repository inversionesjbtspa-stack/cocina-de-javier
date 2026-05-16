import { AppShell } from "@/components/layout/app-shell";

const dtePipeline = [
  "Guardar XML original en Storage privado",
  "Calcular hash SHA-256 e idempotency key",
  "Parsear encabezado, emisor, receptor, montos e items",
  "Validar duplicados por RUT emisor, tipo DTE y folio",
  "Registrar validaciones de schema/firma/SII",
  "Generar PDF versionado desde XML",
  "Preparar matching contra OC y recepcion"
];

const tables = [
  "dte_documents",
  "dte_xml_files",
  "dte_items",
  "dte_references",
  "dte_validation_results",
  "dte_pdf_files"
];

const syncChecks = [
  "Endpoint POST /api/dte/inbox/sync",
  "OAuth Google Workspace requerido",
  "Busqueda Gmail: to:dte@lacocinadejavier.cl has:attachment filename:xml",
  "Parseo XML a factura extraida",
  "Hash SHA-256 e idempotency key por documento"
];

export default function FacturasPage() {
  return (
    <AppShell>
      <section className="space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            XML DTE Chile
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-900">
            Facturas DTE y PDF
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#4e5a52]">
            Base para recibir XML tributarios, conservar el original inmutable,
            validar duplicados, guardar resultados de validacion y generar PDF
            trazable desde el documento electronico.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Pipeline implementado
            </h2>
            <ol className="mt-4 space-y-3">
              {dtePipeline.map((item, index) => (
                <li className="flex gap-3 text-sm leading-6 text-[#4e5a52]" key={item}>
                  <span className="font-semibold text-brand-700">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </article>

          <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
            <h2 className="text-base font-semibold text-brand-900">
              Tablas DTE
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {tables.map((table) => (
                <span
                  className="rounded-md bg-[#edf2ee] px-3 py-2 text-sm font-medium text-brand-700"
                  key={table}
                >
                  {table}
                </span>
              ))}
            </div>
          </article>
        </div>

        <article className="rounded-lg border border-[#dfe4dd] bg-white p-5">
          <h2 className="text-base font-semibold text-brand-900">
            Extraccion desde bandeja de entrada
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {syncChecks.map((item) => (
              <div
                className="rounded-md border border-[#e6ebe5] px-4 py-3 text-sm text-[#4e5a52]"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
