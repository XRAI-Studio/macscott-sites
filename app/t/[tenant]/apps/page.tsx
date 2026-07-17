import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppsExperience } from "@/components/apps/apps-experience";
import { filterCatalogForTenant, getCatalog } from "@/lib/catalog";
import { isTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apps", description: "An interactive nebula of apps and games.", alternates: { canonical: "/apps" } };

export default async function AppsPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tier?: string }> }) {
  const [{ tenant }, query] = await Promise.all([params, searchParams]);
  if (!isTenant(tenant)) notFound();
  const catalog = filterCatalogForTenant(await getCatalog(), tenant);
  const requestedTier = query.tier === "full" || query.tier === "lite" || query.tier === "off" ? query.tier : undefined;
  return <main className="apps-page"><div className="apps-intro"><p className="eyebrow">INTERACTIVE APP CATALOG</p><h1>Orb Nebula</h1><p>Drag to orbit · scroll to glide · select an orb to enter</p></div><AppsExperience apps={catalog.apps} requestedTier={requestedTier} /></main>;
}
