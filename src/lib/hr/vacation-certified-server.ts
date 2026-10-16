import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCertifiedVacationPeriods, mapCertifiedOpening, vacationToday, type CertifiedOpeningBalance } from "./vacation-certified.ts";
import { toVacationPeriod, type VacationPeriodRowLike } from "./vacation-persistence.ts";

export type CertifiedVacationState = { opening: CertifiedOpeningBalance; periods: ReturnType<typeof toVacationPeriod>[] };

export async function loadCertifiedVacationStates(client: Pick<SupabaseClient, "rpc">, tenantId: string) {
  const result = await client.rpc("hr_certified_vacation_states", { p_tenant_id: tenantId });
  if (result.error) {
    if (result.error.code === "PGRST202" || result.error.code === "42883") return [] as CertifiedVacationState[];
    throw new Error("certified_vacation_state_unavailable");
  }
  return ((result.data ?? []) as Array<{ opening: Record<string, unknown>; periods: VacationPeriodRowLike[] }>).map(state => ({
    opening: mapCertifiedOpening(state.opening), periods: state.periods.map(toVacationPeriod)
  }));
}

export function activeCertifiedVacationState(states: CertifiedVacationState[], employeeId: string, asOf = vacationToday()) {
  const state = states.find(s => s.opening.employeeId === employeeId);
  if (!state) return null;
  const periods = buildCertifiedVacationPeriods(state.opening, state.periods, asOf);
  return periods ? { ...state, periods } : null;
}
