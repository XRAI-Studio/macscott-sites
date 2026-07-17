import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isTenant, TENANT_HOSTS } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export async function generateStaticParams() { return [{ tenant: "scott" }, { tenant: "alexander" }]; }

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  if (!isTenant(tenant)) return {};
  const content = getTenantContent(tenant);
  return {
    metadataBase: new URL(`https://${TENANT_HOSTS[tenant]}`),
    title: { default: content.name, template: `%s · ${content.name}` },
    description: content.tagline,
    alternates: { canonical: "/" },
    robots: process.env.VERCEL_ENV === "preview" ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: content.name, description: content.tagline, siteName: content.name, type: "website", images: [{ url: "/og-image", width: 1200, height: 630, alt: content.name }] },
  };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) notFound();
  const content = getTenantContent(tenant);
  return (
    <div className={`tenant-shell tenant-${tenant}`} style={{ "--tenant-primary": content.colors.primary, "--tenant-secondary": content.colors.secondary, "--tenant-glow": content.colors.rgb } as React.CSSProperties}>
      <SiteHeader content={content} />
      {children}
      <SiteFooter content={content} />
    </div>
  );
}
