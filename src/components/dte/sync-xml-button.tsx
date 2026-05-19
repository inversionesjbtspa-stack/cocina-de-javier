"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, X, XCircle } from "lucide-react";

type SyncResult = {
  ok: boolean;
  found?: number;
  count?: number;
  duplicated?: number;
  rejected?: Array<{ fileName?: string; reason?: string }>;
  persisted?: unknown[];
  error?: string;
};

export function SyncXmlButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function syncXml() {
    setOpen(true);
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/dte/inbox/sync", {
        body: JSON.stringify({ maxResults: 25 }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = (await response.json()) as SyncResult;
      setResult(data);
      if (response.ok && data.ok) {
        router.refresh();
      }
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "No fue posible sincronizar Gmail.",
        ok: false
      });
    } finally {
      setLoading(false);
    }
  }

  const rejected = result?.rejected?.length ?? 0;
  const processed = result?.count ?? result?.persisted?.length ?? 0;
  const found = result?.found ?? 0;
  const duplicated = result?.duplicated ?? Math.max(found - processed - rejected, 0);

  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900 disabled:cursor-wait disabled:opacity-70"
        disabled={loading}
        onClick={syncXml}
        type="button"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizar XML
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#eadfd9] bg-white shadow-[0_28px_80px_rgba(43,16,24,0.25)]">
            <div className="flex items-start justify-between border-b border-[#eadfd9] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                  Sincronizacion Gmail DTE
                </p>
                <h3 className="mt-1 text-lg font-semibold text-brand-900">
                  Procesamiento XML
                </h3>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-lg border border-[#eadfd9] p-2 text-[#6f6263] transition hover:bg-brand-50"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {loading ? (
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-700" />
                    <div>
                      <p className="font-semibold text-brand-900">Leyendo bandeja DTE</p>
                      <p className="mt-1 text-sm text-[#6f6263]">
                        Descargando adjuntos, validando XML, calculando hash y actualizando Supabase.
                      </p>
                    </div>
                  </div>
                </div>
              ) : result?.ok ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="font-semibold text-emerald-950">Dashboard actualizado</p>
                      <p className="mt-1 text-sm text-emerald-900">
                        Se procesaron XML desde Gmail sin mostrar JSON tecnico en pantalla.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-red-700" />
                    <div>
                      <p className="font-semibold text-red-950">No se pudo sincronizar</p>
                      <p className="mt-1 text-sm text-red-900">{result?.error ?? "Error desconocido."}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Encontrados", found],
                  ["Procesados", processed],
                  ["Duplicados", duplicated],
                  ["Rechazados", rejected]
                ].map(([label, value]) => (
                  <div className="rounded-xl border border-[#eadfd9] bg-[#fffdfb] p-3" key={String(label)}>
                    <p className="text-xs text-[#7b6f70]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-brand-900">{String(value)}</p>
                  </div>
                ))}
              </div>

              {rejected ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-950">XML rechazados</p>
                  <div className="mt-2 space-y-1">
                    {result?.rejected?.slice(0, 4).map((item) => (
                      <p className="text-xs text-amber-900" key={`${item.fileName}-${item.reason}`}>
                        {item.fileName ?? "Adjunto"}: {item.reason ?? "No valido"}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
