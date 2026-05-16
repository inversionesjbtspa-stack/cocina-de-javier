import { requireUser } from "@/lib/auth/session";
import { hasSupabasePublicConfig } from "@/lib/env";
import type { ReactNode } from "react";

export default async function ErpLayout({
  children
}: {
  children: ReactNode;
}) {
  if (hasSupabasePublicConfig()) {
    await requireUser();
  }

  return children;
}
