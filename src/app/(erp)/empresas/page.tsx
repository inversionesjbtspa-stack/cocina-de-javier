import { AdminCoreSection } from "@/components/sections/admin-core-section";

export default function EmpresasPage() {
  return (
    <AdminCoreSection
      dataModel={["tenants", "companies", "branches", "user_memberships"]}
      description="Base multi-empresa para operar razones sociales, sucursales y acceso por usuario dentro del ERP."
      primaryActions={[
        "Mantener razon social, RUT, giro, direccion y correo DTE.",
        "Crear sucursales operativas con codigo interno unico.",
        "Asignar usuarios por tenant, empresa, sucursal y rol.",
        "Restringir lectura y escritura mediante RLS."
      ]}
      title="Empresas y sucursales"
      validationRules={[
        "RUT unico por tenant.",
        "Codigo de sucursal unico por empresa.",
        "Cambios administrativos visibles en auditoria.",
        "Solo owner/admin puede administrar estructura."
      ]}
    />
  );
}
