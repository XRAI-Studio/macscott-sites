export const TENANTS = ["scott", "alexander"] as const;
export type Tenant = (typeof TENANTS)[number];

export const TENANT_HOSTS: Record<Tenant, string> = {
  scott: "scott.macscott.net",
  alexander: "alexander.macscott.net",
};

type ResolveInput = {
  host: string;
  pathname: string;
  search: string;
  vercelEnv?: string;
};

export type TenantResolution =
  | { kind: "redirect"; status: 301 | 307; location: string }
  | { kind: "rewrite"; tenant: Tenant; noindex: boolean; canonicalOrigin: string };

export function selectTenantHostHeader(host: string | null, forwardedHost: string | null, isVercel: boolean): string {
  return (isVercel ? forwardedHost : host) ?? host ?? forwardedHost ?? "";
}

function normalizedHost(host: string): string {
  const forwarded = host.split(",")[0]?.trim().toLowerCase() ?? "";
  return forwarded.replace(/:\d+$/, "");
}

function queryTenant(search: string): Tenant | undefined {
  const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tenant");
  return value === "scott" || value === "alexander" ? value : undefined;
}

export function resolveTenantRequest(input: ResolveInput): TenantResolution {
  const host = normalizedHost(input.host);
  const production = input.vercelEnv === "production";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const isVercel = host.endsWith(".vercel.app");
  const customTenant = (Object.entries(TENANT_HOSTS) as [Tenant, string][]).find(([, value]) => value === host)?.[0];
  const override = production ? undefined : queryTenant(input.search);
  const tenant: Tenant = customTenant ?? override ?? "scott";

  if (!customTenant && !isLocal && !isVercel) {
    return { kind: "redirect", status: 301, location: `https://${TENANT_HOSTS.scott}${input.pathname}${input.search}` };
  }
  if (production && isVercel) {
    return { kind: "redirect", status: 301, location: `https://${TENANT_HOSTS[tenant]}${input.pathname}${input.search}` };
  }
  return {
    kind: "rewrite",
    tenant,
    noindex: isVercel && input.vercelEnv === "preview",
    canonicalOrigin: `https://${TENANT_HOSTS[tenant]}`,
  };
}

export function isTenant(value: string): value is Tenant {
  return (TENANTS as readonly string[]).includes(value);
}
