import { PackageSearch } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ProductExplorer } from "@/components/products/product-explorer";
import { MetricCard, PremiumPanel } from "@/components/ui/enterprise";
import { productAnalyticsFromData } from "@/lib/finance/enterprise-analytics";
import { getDtePurchaseData } from "@/lib/dte/supabase-data";
import { formatClp } from "@/lib/dte/purchases-data";

export default async function ProductosPage() {
  const dteData = await getDtePurchaseData();
  const products = productAnalyticsFromData(dteData, 80);
  const critical = products.filter((product) => product.risk === "critical");
  const top = products[0];
  const totalProducts = dteData.summaries.products.length;
  const movedAmount = products.reduce((sum, product) => sum + product.total, 0);

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              Centro analitico de compras
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Productos</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Busqueda real por producto, proveedor y precio, con comparacion
              entre proveedores, historico y exportaciones operativas.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard detail="Insumos detectados en XML" href="/productos?filter=listado" label="Productos" value={String(totalProducts)} />
          <MetricCard detail={top?.description ?? "Sin datos" } href={`/productos?producto=${encodeURIComponent(top?.description ?? "")}`} label="Mas comprado" value={top?.totalClp ?? "$0"} />
          <MetricCard detail="Sobre umbral de variacion" href="/productos?riesgo=critical" label="Alzas criticas" tone={critical.length ? "critical" : "neutral"} value={String(critical.length)} />
          <MetricCard detail="Muestra analitica top productos" href="/compras?filter=analizado" label="Monto analizado" value={formatClp(movedAmount)} />
          <MetricCard detail="Ultimos precios por proveedor" href="/productos?filter=trazabilidad" label="Trazabilidad" tone="success" value="Activa" />
        </div>

        <ProductExplorer products={products} />

        <PremiumPanel className="p-5">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-brand-900">Controles enterprise</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              "Historial de precios por proveedor",
              "Comparacion mensual y anual",
              "Productos duplicados por descripcion",
              "Alertas de precio exportables"
            ].map((item) => (
              <div className="rounded-md border border-[#eadfd9] bg-brand-50 p-3 text-sm font-medium text-brand-900" key={item}>
                {item}
              </div>
            ))}
          </div>
        </PremiumPanel>
      </section>
    </AppShell>
  );
}
