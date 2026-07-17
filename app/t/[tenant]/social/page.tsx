import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isTenant } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export const metadata: Metadata = { title: "Social", alternates: { canonical: "/social" } };

export default async function SocialPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) notFound();
  const content = getTenantContent(tenant);
  return <main className="page"><p className="eyebrow">FIND ME ONLINE</p><h1 className="page-title">Social signals.</h1><div className="card-list">{content.socials.map((social) => <a className={`content-card${social.placeholder ? " placeholder" : ""}`} href={social.href} key={social.label} rel="noreferrer" target="_blank"><h2>{social.label} ↗</h2><p>{social.placeholder ? "URL ready to replace in the tenant content file." : social.href}</p></a>)}</div></main>;
}
