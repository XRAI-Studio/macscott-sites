import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";
import { loadBlogPosts, renderMarkdown } from "@/lib/blog";
import { isTenant } from "@/lib/tenant";

export async function generateStaticParams() {
  const tenants = ["scott", "alexander"] as const;
  const groups = await Promise.all(tenants.map(async (tenant) => (await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant))).map((post) => ({ tenant, slug: post.slug }))));
  return groups.flat();
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string }> }): Promise<Metadata> {
  const { tenant, slug } = await params;
  if (!isTenant(tenant)) return {};
  const post = (await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant))).find((item) => item.slug === slug);
  return post ? { title: post.title, description: post.description, alternates: { canonical: `/blog/${slug}` } } : {};
}

export default async function BlogPostPage({ params }: { params: Promise<{ tenant: string; slug: string }> }) {
  const { tenant, slug } = await params;
  if (!isTenant(tenant)) notFound();
  const post = (await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant))).find((item) => item.slug === slug);
  if (!post) notFound();
  const html = await renderMarkdown(post.markdown);
  return <main className="page"><article><p className="eyebrow">{post.date}</p><h1 className="page-title">{post.title}</h1><p className="lede">{post.description}</p><div className="prose" dangerouslySetInnerHTML={{ __html: html }} /></article></main>;
}
