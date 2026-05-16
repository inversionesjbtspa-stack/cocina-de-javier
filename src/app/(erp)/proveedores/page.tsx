import { AdminCoreSection } from "@/components/sections/admin-core-section";

export default function ProveedoresPage() {
  return (
    <AdminCoreSection
      dataModel={[
        "suppliers",
        "supplier_contacts",
        "supplier_bank_accounts",
        "supplier_documents"
      ]}
      description="Maestro de proveedores preparado para compras, facturas DTE, cuentas por pagar y pagos masivos."
      primaryActions={[
        "Registrar proveedor con RUT, razon social, giro y condiciones de pago.",
        "Administrar contactos comerciales y operativos.",
        "Mantener cuentas bancarias con estado de validacion.",
        "Adjuntar documentos en Storage privado."
      ]}
      title="Proveedores"
      validationRules={[
        "RUT unico por tenant.",
        "Proveedor bloqueado no puede entrar a pagos.",
        "Cuenta bancaria requiere validacion antes de uso financiero.",
        "Documentos guardados con bucket, ruta y hash."
      ]}
    />
  );
}
