import { ModulePlaceholder } from "@/components/sections/module-placeholder";

export default function AuditoriaPage() {
  return (
    <ModulePlaceholder
      description="Registro append-only para acciones sensibles, cambios de datos maestros, pagos y documentos."
      items={[
        "Eventos por usuario y rol",
        "Trazabilidad de XML y pagos",
        "Logs de integraciones",
        "Exportaciones controladas"
      ]}
      title="Auditoria"
    />
  );
}
