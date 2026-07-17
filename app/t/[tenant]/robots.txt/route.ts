import { isTenant, TENANT_HOSTS } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) return new Response("Not found", { status: 404 });
  const origin = `https://${TENANT_HOSTS[tenant]}`;
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
