import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UniversalSearch } from "@/components/search/universal-search";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SidebarNav />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-[#eadfd9] bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Control ejecutivo
              </p>
              <p className="text-xs text-[#6f6263]">
                Actualizado hace 5 minutos · Preview Vercel · Supabase activo
              </p>
            </div>

            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <UniversalSearch />
              <div className="hidden items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 md:flex">
                <span className="h-2 w-2 rounded-full bg-brand-700" />
                Build cloud activo
              </div>
              <button
                className="hidden items-center gap-2 rounded-md border border-[#eadfd9] bg-white px-3 py-2 text-sm font-medium text-[#4d3f42] hover:bg-brand-50 md:flex"
                type="button"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Refrescar
              </button>
              <form action={signOut}>
                <button
                  className="rounded-md border border-[#eadfd9] px-3 py-2 text-sm font-medium text-[#4d3f42] hover:bg-brand-50"
                  type="submit"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
