import { AdminCoreSection } from "@/components/sections/admin-core-section";

export default function ProductosPage() {
  return (
    <AdminCoreSection
      dataModel={[
        "product_categories",
        "products",
        "product_supplier_links",
        "product_price_history"
      ]}
      description="Catalogo de productos e insumos con historial de precios para analisis de variaciones y compras frecuentes."
      primaryActions={[
        "Crear categorias y productos con unidad de medida.",
        "Vincular productos con proveedores.",
        "Guardar precio historico por proveedor y fecha efectiva.",
        "Preparar base para productos mas comprados y variacion de precios."
      ]}
      title="Productos"
      validationRules={[
        "SKU y nombre unicos por tenant.",
        "Precio historico no puede ser negativo.",
        "Cambios de catalogo limitados a roles de compras/admin.",
        "Historial conserva origen del dato para trazabilidad."
      ]}
    />
  );
}
