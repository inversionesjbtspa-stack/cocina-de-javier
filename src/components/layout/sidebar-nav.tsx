"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  FileText,
  Landmark,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  ShoppingBasket,
  Users,
  UsersRound,
  WalletCards
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

const navigation = [
  { href: "/", label: "Dashboard", section: "Control", icon: BarChart3 },
  { href: "/proveedores", label: "Proveedores", section: "Operacion", icon: UsersRound },
  { href: "/productos", label: "Productos", section: "Operacion", icon: ShoppingBasket },
  { href: "/facturas", label: "Facturas DTE", section: "Operacion", icon: FileText },
  { href: "/compras", label: "Compras", section: "Operacion", icon: Package },
  { href: "/tesoreria", label: "Tesoreria", section: "Finanzas", icon: Landmark },
  { href: "/pagos", label: "Pagos", section: "Finanzas", icon: WalletCards },
  { href: "/recursos-humanos", label: "Recursos Humanos", section: "Gestion", icon: Users },
  { href: "/auditoria", label: "Auditoria", section: "Control", icon: ShieldCheck }
] as const;

const sections = ["Control", "Operacion", "Finanzas", "Gestion"] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-20 hidden border-r border-[#eadfd9] bg-[#fffaf6]/95 px-4 py-5 shadow-[18px_0_48px_rgba(43,16,24,0.07)] backdrop-blur-xl transition-[width] duration-200 lg:block",
        collapsed ? "w-24" : "w-72"
      ].join(" ")}
    >
      <div className="rounded-2xl border border-white/80 bg-white/[0.88] p-3 shadow-sm">
        <Link className="flex items-center justify-center rounded-xl bg-white p-2" href="/">
          {collapsed ? (
            <span className="text-lg font-semibold text-brand-700">LCJ</span>
          ) : (
            <BrandLogo compact />
          )}
        </Link>
        <div className="mt-3 flex items-center justify-between border-t border-[#f0e6df] pt-3">
          <div className={collapsed ? "hidden" : "min-w-0"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              ERP financiero
            </p>
            <p className="mt-1 truncate text-xs text-[#7a6865]">
              Operacion La Cocina de Javier
            </p>
          </div>
          <button
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            className="rounded-lg border border-[#eadfd9] bg-[#fffaf6] p-2 text-brand-700 transition hover:bg-brand-50"
            onClick={() => setCollapsed((value) => !value)}
            type="button"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav className="mt-6 space-y-5">
        {sections.map((section) => {
          const items = navigation.filter((item) => item.section === section);
          return (
            <div key={section}>
              <p className={collapsed ? "sr-only" : "px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b8a85]"}>
                {section}
              </p>
              <div className="mt-2 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

                  return (
                    <Link
                      className={[
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                        isActive
                          ? "bg-white text-brand-900 shadow-sm ring-1 ring-[#eadfd9]"
                          : "text-[#55484a] hover:bg-white/80 hover:text-brand-900"
                      ].join(" ")}
                      href={item.href}
                      key={item.href}
                    >
                      <span
                        className={[
                          "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full transition",
                          isActive ? "bg-brand-700" : "bg-transparent group-hover:bg-brand-100"
                        ].join(" ")}
                      />
                      <Icon
                        aria-hidden="true"
                        className={isActive ? "h-4 w-4 text-brand-700" : "h-4 w-4 text-[#9b8a85]"}
                      />
                      <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={collapsed ? "hidden" : "absolute bottom-5 left-4 right-4 rounded-2xl border border-[#eadfd9] bg-white/[0.84] p-3 text-xs text-[#6f6263] shadow-sm"}>
        <div className="flex items-center gap-2 font-semibold text-brand-900">
          <Menu className="h-4 w-4 text-brand-700" />
          Modo ejecutivo
        </div>
        <p className="mt-1 leading-5">
          Navegacion limpia para una sola operacion, con datos financieros y DTE reales.
        </p>
      </div>
    </aside>
  );
}
