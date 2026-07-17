import path from "node:path";
import { loadBlogPosts } from "@/lib/blog";
import { isTenant, TENANT_HOSTS } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) return new Response("Not found", { status: 404 });
  const origin = `https://${TENANT_HOSTS[tenant]}`;
  const posts = await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant));
  const paths = ["", "/apps", "/blog", "/social", ...posts.map((post) => `/blog/${post.slug}`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((value) => `<url><loc>${origin}${value || "/"}</loc></url>`).join("")}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
