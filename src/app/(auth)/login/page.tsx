import { signInWithPassword } from "@/lib/auth/actions";

const errorMessages: Record<string, string> = {
  "missing-credentials": "Ingresa email y contrasena.",
  "invalid-credentials": "Las credenciales no son validas."
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] px-5">
      <section className="w-full max-w-md rounded-lg border border-[#dfe4dd] bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            La Cocina de Javier
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-900">
            Acceso ERP
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5d665f]">
            Ingresa con tu usuario autorizado para acceder a la plataforma
            administrativa.
          </p>
        </div>

        <form action={signInWithPassword} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-[#344238]">Email</span>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-md border border-[#cfd8d1] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              name="email"
              required
              type="email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#344238]">
              Contrasena
            </span>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-[#cfd8d1] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
            className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
            type="submit"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
