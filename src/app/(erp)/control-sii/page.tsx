import { AppShell } from "@/components/layout/app-shell";
import { PremiumPanel } from "@/components/ui/enterprise";
import { SiiControlClient } from "@/components/sii/sii-control-client";

export default function ControlSiiPage() {
  return (
    <AppShell>
      <section className="space-y-6">
        <PremiumPanel className="overflow-hidden">
          <div className="bg-brand-900 px-6 py-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-100">Control tributario asistido</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Control SII vs XML</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-[#f3e5dc]">
              Compara el Registro de Compras SII contra XML recibidos por Gmail para detectar documentos faltantes, diferencias de monto y acciones de reclamo.
            </p>
          </div>
        </PremiumPanel>
        <SiiControlClient />
        <PremiumPanel className="p-5">
          <h2 className="text-lg font-semibold text-brand-900">Siguiente etapa de integracion SII</h2>
          <p className="mt-2 text-sm leading-6 text-[#667068]">
            La integracion directa con SII requiere revisar mecanismo disponible para contribuyente: certificado digital, autorizacion tributaria, clave tributaria o proveedor certificado. Por seguridad, esta primera etapa usa importacion asistida del Registro de Compras descargado desde SII.
          </p>
        </PremiumPanel>
      </section>
    </AppShell>
  );
}
