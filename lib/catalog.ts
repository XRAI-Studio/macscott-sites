import { unstable_cache } from "next/cache";
import { buildCatalog, type Catalog } from "@/lib/catalog-builder";
import { GitHubRestClient } from "@/lib/github-client";
import type { Tenant } from "@/lib/tenant";

const ACCOUNTS = ["XRAI-Studio", "alexandermacscott-del"];
let lastGood: Catalog | null = null;
let lastAttempt: { at: string; stale: boolean; error?: string } | null = null;

async function refreshCatalog(): Promise<Catalog> {
  if (process.env.NODE_ENV === "production" && !process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required in production");
  }
  const catalog = await buildCatalog(new GitHubRestClient(process.env.GITHUB_TOKEN), ACCOUNTS);
  lastGood = catalog;
  lastAttempt = { at: new Date().toISOString(), stale: false };
  console.info(JSON.stringify({ event: "catalog.refresh.complete", apps: catalog.apps.length, rejected: catalog.diagnostics.rejected.length, rateLimitRemaining: catalog.diagnostics.rateLimitRemaining }));
  return catalog;
}

const cachedCatalog = unstable_cache(refreshCatalog, ["macscott-global-catalog"], { tags: ["catalog"], revalidate: 3600 });

export async function getCatalog(): Promise<Catalog> {
  try {
    const catalog = await cachedCatalog();
    lastGood = catalog;
    return catalog;
  } catch (error) {
    lastAttempt = { at: new Date().toISOString(), stale: Boolean(lastGood), error: error instanceof Error ? error.message : String(error) };
    if (lastGood) {
      console.warn(JSON.stringify({ event: "catalog.refresh.stale_serve", ...lastAttempt }));
      return lastGood;
    }
    if (!process.env.GITHUB_TOKEN && process.env.VERCEL_ENV !== "production") {
      console.warn(JSON.stringify({ event: "catalog.dev.empty", reason: lastAttempt.error }));
      return { apps: [], diagnostics: { builtAt: lastAttempt.at, accepted: [], rejected: [{ repo: "catalog", reason: lastAttempt.error ?? "Unavailable" }] } };
    }
    throw error;
  }
}

export function filterCatalogForTenant(catalog: Catalog, tenant: Tenant): Catalog {
  return { ...catalog, apps: catalog.apps.filter((app) => app.owner === tenant || app.owner === "both") };
}

export function getCatalogRuntimeStatus() {
  return { lastAttempt, lastGood: lastGood ? { appCount: lastGood.apps.length, diagnostics: lastGood.diagnostics } : null };
}
