import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppDetailOverlay } from "@/components/apps/app-detail-overlay";
import { filterCatalogForTenant, getCatalog } from "@/lib/catalog";
import { isTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string }> }): Promise<Metadata> {
  const { tenant, slug } = await params;
  if (!isTenant(tenant)) return {};
  const app = filterCatalogForTenant(await getCatalog(), tenant).apps.find((item) => item.slug === slug);
  return app ? { title: app.title, description: app.description, alternates: { canonical: `/apps/${app.slug}` } } : {};
}

export default async function AppDetailPage({ params }: { params: Promise<{ tenant: string; slug: string }> }) {
  const { tenant, slug } = await params;
  if (!isTenant(tenant)) notFound();
  const app = filterCatalogForTenant(await getCatalog(), tenant).apps.find((item) => item.slug === slug);
  if (!app) notFound();
  return <AppDetailOverlay app={app} />;
}
