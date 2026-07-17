import path from "node:path";
import { loadBlogPosts } from "@/lib/blog";
import { isTenant, TENANT_HOSTS } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

function xml(value: string) { return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!); }

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) return new Response("Not found", { status: 404 });
  const posts = await loadBlogPosts(path.join(process.cwd(), "content", "blog", tenant));
  const content = getTenantContent(tenant);
  const origin = `https://${TENANT_HOSTS[tenant]}`;
  const items = posts.map((post) => `<item><title>${xml(post.title)}</title><link>${origin}/blog/${post.slug}</link><guid>${origin}/blog/${post.slug}</guid><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate><description>${xml(post.description)}</description></item>`).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(content.name)} — Blog</title><link>${origin}/blog</link><description>${xml(content.tagline)}</description>${items}</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
