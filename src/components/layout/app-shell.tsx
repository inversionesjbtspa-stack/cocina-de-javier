import Link from "next/link";
import type { Route } from "next";
import {
  BarChart3,
  Building2,
  FileText,
  RefreshCw,
  Package,
  Landmark,
  ShieldCheck,
  ShoppingBasket,
  Users,
  UsersRound,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/brand/logo";

const navigation: Array<{
  href: Route;
  label: string;
  icon: typeof BarChart3;
}> = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/empresas", label: "Empresas", icon: Building2 },
  { href: "/proveedores", label: "Proveedores", icon: UsersRound },
  { href: "/productos", label: "Productos", icon: ShoppingBasket },
  { href: "/facturas", label: "Facturas DTE", icon: FileText },
  { href: "/compras", label: "Compras", icon: Package },
  { href: "/tesoreria", label: "Tesoreria", icon: Landmark },
  { href: "/recursos-humanos", label: "Recursos Humanos", icon: Users },
  { href: "/pagos", label: "Pagos", icon: WalletCards },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-[#eadfd9] bg-white/95 px-5 py-6 shadow-[14px_0_36px_rgba(43,16,24,0.06)] backdrop-blur lg:block">
        <Link className="block rounded-xl bg-brand-900 p-3 shadow-sm" href="/">
          <BrandLogo compact />
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-gold-100">
            ERP financiero cloud
          </p>
        </Link>

        <nav className="mt-8 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#4d3f42] transition hover:bg-brand-100 hover:text-brand-900"
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-[#eadfd9] bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Control ejecutivo
              </p>
              <p className="text-xs text-[#6f6263]">
                Actualizado hace 5 minutos · Preview Vercel · Supabase activo
              </p>
            </div>
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
        </header>

        <main className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
