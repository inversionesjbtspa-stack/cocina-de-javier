type AnniversaryClient = {
  rpc(name: string, args: { p_tenant_id: string }): PromiseLike<{
    data: { created_count?: number } | null;
    error: { message: string } | null;
  }>;
};

export async function materializeVacationAnniversaries(client: AnniversaryClient, tenantIds: string[]) {
  let created = 0;
  for (const tenantId of [...new Set(tenantIds)].sort()) {
    const result = await client.rpc("hr_materialize_certified_anniversaries", { p_tenant_id: tenantId });
    if (result.error || !result.data || !Number.isInteger(result.data.created_count) || Number(result.data.created_count) < 0) {
      throw new Error("vacation_anniversary_materialization_failed");
    }
    created += Number(result.data.created_count);
  }
  return { created };
}
