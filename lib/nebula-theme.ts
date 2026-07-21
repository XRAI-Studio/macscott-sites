import type { Tenant } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export type NebulaTheme = {
  effect: "fire" | "lightning";
  palette: { core: string; mid: string; glow: string };
  shellTint: string;
};

export function nebulaTheme(tenant: Tenant): NebulaTheme {
  const { colors } = getTenantContent(tenant);
  return { effect: tenant === "scott" ? "fire" : "lightning", palette: { core: colors.primary, mid: colors.secondary, glow: colors.glow }, shellTint: colors.primary };
}
