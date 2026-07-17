import { alexanderContent } from "@/content/tenants/alexander";
import { scottContent } from "@/content/tenants/scott";
import type { TenantContent } from "@/content/tenants/types";
import type { Tenant } from "@/lib/tenant";

export const tenantContent: Record<Tenant, TenantContent> = {
  scott: scottContent,
  alexander: alexanderContent,
};

export function getTenantContent(tenant: Tenant): TenantContent {
  return tenantContent[tenant];
}
