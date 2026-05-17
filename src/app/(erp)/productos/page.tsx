import { BarChart3, Filter, PackageSearch, Search, Tag, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MetricCard, PremiumPanel, ProgressBar, StatusPill } from "@/components/ui/enterprise";
import { productAnalytics } from "@/lib/finance/enterprise-analytics";
import { formatClp, purchasesData } from "@/lib/dte/purchases-data";

export default function ProductosPage() {
  const products = productAnalytics(24);
  const critical = products.filter((product) => product.risk === "critical");
  const top = products[0];
  const totalProducts = purchasesData.summaries.products.length;
  const movedAmount = products.reduce((sum, product) => sum + product.total, 0);

  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">
              Centro analitico de compras
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Productos
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Ranking de insumos, evolucion de precios, mejor compra historica,
              alertas de alza y comparacion entre proveedores desde XML DTE.
            </p>
          </div>
        </PremiumPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            detail="Insumos detectados en XML"
            label="Productos"
            value={String(totalProducts)}
          />
          <MetricCard
            detail={top?.description ?? "Sin datos"}
            label="Mas comprado"
            value={top?.totalClp ?? "$0"}
          />
          <MetricCard
            detail="Sobre umbral de variacion"
            label="Alzas criticas"
            tone={critical.length ? "critical" : "neutral"}
            value={String(critical.length)}
          />
          <MetricCard
            detail="Muestra analitica top productos"
            label="Monto analizado"
            value={formatClp(movedAmount)}
          />
          <MetricCard
            detail="Ultimos precios por proveedor"
            label="Trazabilidad"
            tone="success"
            value="Activa"
          />
        </div>

        <PremiumPanel className="p-5">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="block lg:col-span-2">
              <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
                <Search className="h-4 w-4" />
                Buscar producto
              </span>
              <input
                className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm"
                placeholder="Nombre, proveedor, etiqueta o categoria"
                type="search"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
                <Filter className="h-4 w-4" />
                Riesgo
              </span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Todos</option>
                <option>Alza critica</option>
                <option>Atencion</option>
                <option>Estable</option>
              </select>
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[#6f6263]">
                <Tag className="h-4 w-4" />
                Categoria
              </span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Todas</option>
                <option>Carnes</option>
                <option>Bebidas</option>
                <option>Abarrotes</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#6f6263]">Vista</span>
              <select className="mt-2 w-full rounded-md border border-[#eadfd9] px-3 py-2 text-sm">
                <option>Power BI ejecutivo</option>
                <option>Tabla compacta</option>
                <option>Variacion precio</option>
              </select>
            </label>
          </div>
        </PremiumPanel>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <PremiumPanel className="p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-semibold text-brand-900">
                Vista Power BI ejecutiva
              </h2>
            </div>
            <div className="mt-5 space-y-4">
              {products.slice(0, 12).map((product) => {
                const width = top ? (product.total / top.total) * 100 : 0;
                return (
                  <div key={product.description}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-900">
                          {product.description}
                        </p>
                        <p className="text-xs text-[#6f6263]">
                          Ultima compra {product.lastPriceClp} · Mejor historico {product.bestPriceClp}
                        </p>
                      </div>
                      <StatusPill tone={product.risk}>
                        {product.variation > 0 ? `+${product.variation.toFixed(1)}%` : "Estable"}
                      </StatusPill>
                    </div>
                    <div className="mt-2">
                      <ProgressBar tone={product.risk === "critical" ? "gold" : "brand"} value={width} />
                    </div>
                  </div>
                );
              })}
            </div>
          </PremiumPanel>

          <PremiumPanel className="overflow-hidden">
            <div className="border-b border-[#eadfd9] px-5 py-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-brand-700" />
                <h2 className="text-lg font-semibold text-brand-900">
                  Alertas de precio
                </h2>
              </div>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-[#fffaf7]">
                  <tr className="border-b border-[#eadfd9] text-left text-xs uppercase text-brand-700">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3 text-right">Ultimo</th>
                    <th className="px-4 py-3 text-right">Mejor</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr className="border-b border-[#f0e5df] hover:bg-brand-50" key={product.description}>
                      <td className="px-4 py-3 font-medium text-brand-900">
                        {product.description}
                      </td>
                      <td className="px-4 py-3 text-[#6f6263]">
                        {product.last?.supplier}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-700">
                        {product.lastPriceClp}
                      </td>
                      <td className="px-4 py-3 text-right text-[#6f6263]">
                        {product.bestPriceClp}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={product.risk}>
                          {product.risk === "critical" ? "Alza critica" : product.risk === "warning" ? "Atencion" : "Estable"}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumPanel>
        </section>

        <PremiumPanel className="p-5">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-brand-900">
              Controles enterprise
            </h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              "Historial de precios por proveedor",
              "Comparacion mensual y anual",
              "Productos duplicados por descripcion",
              "Export Excel/PDF preparado"
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
