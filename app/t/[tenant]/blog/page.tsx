import type { Metadata } from "next";
import Link from "next/link";
import path from "node:path";
import { notFound } from "next/navigation";
import { loadBlogPosts } from "@/lib/blog";
import { isTenant } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export const metadata: Metadata = { title: "Blog", alternates: { canonical: "/blog" } };

export default async function BlogPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) notFound();
  const posts = await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant));
  const content = getTenantContent(tenant);
  return <main className="page"><p className="eyebrow">TRANSMISSIONS FROM {content.agent.toUpperCase()}</p><h1 className="page-title">Build notes.</h1><div className="card-list">{posts.map((post) => <Link className="content-card" href={`/blog/${post.slug}`} key={post.slug}><time>{post.date}</time><h2>{post.title}</h2><p>{post.description}</p></Link>)}</div></main>;
}
