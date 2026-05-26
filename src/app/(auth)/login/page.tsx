import { signInWithPassword } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/brand/logo";

const errorMessages: Record<string, string> = {
  "missing-credentials": "Ingresa email y contrasena.",
  "invalid-credentials": "Las credenciales no son validas.",
  "session-required": "Debes iniciar sesion para entrar al ERP.",
  "no-access": "Tu usuario no tiene permisos activos en la empresa."
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : null;

  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_top_left,#fffaf6_0,#f7eee8_38%,#efe0d8_100%)] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden border-r border-[#eadfd9] bg-[#fffaf6]/70 px-10 py-12 text-brand-900 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="inline-flex rounded-2xl border border-[#eadfd9] bg-white px-5 py-4 shadow-sm">
            <BrandLogo />
          </div>
          <h1 className="mt-8 max-w-xl text-5xl font-semibold leading-tight tracking-tight">
            ERP financiero para control administrativo real.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#5d514f]">
            Acceso privado para compras, tesoreria, facturas DTE, pagos,
            proveedores y auditoria operacional.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-[#eadfd9] bg-white px-4 py-3 text-brand-900">
            Cocina de Javier 1995
          </div>
          <div className="rounded-lg border border-[#eadfd9] bg-white px-4 py-3 text-brand-900">
            © by Jesús Betancourt
          </div>
        </div>
      </section>

      <section className="grid place-items-center px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-[#eadfd9] bg-white/92 p-7 shadow-[0_24px_70px_rgba(43,16,24,0.12)] backdrop-blur">
          <div className="mb-6 flex justify-center rounded-xl border border-[#f0e4dc] bg-[#fffaf6] px-4 py-3 lg:hidden">
            <BrandLogo compact />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
              Acceso seguro
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-brand-900">
              Entrar al ERP
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5d665f]">
              Usa tu cuenta autorizada para ingresar al panel financiero y
              operativo de La Cocina de Javier.
            </p>
          </div>

          <form action={signInWithPassword} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-[#4d3f42]">Email</span>
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-md border border-[#eadfd9] bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                name="email"
                required
                type="email"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[#4d3f42]">
                Contrasena
              </span>
              <input
                autoComplete="current-password"
                className="mt-2 w-full rounded-md border border-[#eadfd9] bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                name="password"
                required
                type="password"
              />
            </label>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-900"
              type="submit"
            >
              Entrar
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-[#667068]">
            Acceso restringido. Toda actividad queda sujeta a trazabilidad y
            auditoria del sistema.
          </p>
          <div className="mt-5 flex items-center justify-between border-t border-[#f0e4dc] pt-4 text-xs font-semibold text-brand-700">
            <span>Cocina de Javier 1995</span>
            <span>© by Jesús Betancourt</span>
          </div>
        </div>
      </section>
    </main>
  );
}
