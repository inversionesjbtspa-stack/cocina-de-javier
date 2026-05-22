"use client";

import { useState } from "react";

export function RepairConsistencyButton() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function repair() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/dte/repair-consistency", { method: "POST" });
    const result = await response.json();
    setMessage(response.ok ? `Reparacion ejecutada: ${result.rebuilt ?? 0} DTE procesados.` : "No se pudo reparar con la sesion actual.");
    setBusy(false);
  }
  return <div className="flex flex-col items-start gap-1"><button className="rounded-md border border-brand-700 px-3 py-2 text-xs font-semibold text-brand-700" disabled={busy} onClick={repair} type="button">{busy ? "Reparando..." : "Reparar consistencia XML"}</button>{message ? <span className="text-xs text-[#6f6263]">{message}</span> : null}</div>;
}
