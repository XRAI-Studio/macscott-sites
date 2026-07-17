import { isTenant, TENANT_HOSTS } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export const dynamic = "force-static";
export function generateStaticParams() { return [{ tenant: "scott" }, { tenant: "alexander" }]; }

function escapeHtml(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" })[char]!);
}

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) return new Response("Not found", { status: 404 });
  const content = getTenantContent(tenant);
  const origin = `https://${TENANT_HOSTS[tenant]}`;
  const socials = content.socials.map((social) => `<a class="${social.placeholder ? "placeholder" : ""}" href="${escapeHtml(social.href)}" rel="noreferrer" target="_blank">${escapeHtml(social.label)}</a>`).join("");
  const robots = process.env.VERCEL_ENV === "preview" ? "noindex, nofollow" : "index, follow";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.name)}</title><meta name="description" content="${escapeHtml(content.tagline)}"><meta name="robots" content="${robots}">
<link rel="canonical" href="${origin}/"><meta property="og:title" content="${escapeHtml(content.name)}"><meta property="og:description" content="${escapeHtml(content.tagline)}"><meta property="og:image" content="${origin}/og-image"><meta property="og:type" content="website"><link rel="stylesheet" href="/landing.css"></head>
<body style="--tenant-primary:${content.colors.primary};--tenant-secondary:${content.colors.secondary};--tenant-glow:${content.colors.rgb}"><div class="shell"><header><a class="wordmark" href="/" aria-label="${escapeHtml(content.name)} home"><span>◉</span> ${escapeHtml(content.name.toUpperCase())}</a><nav aria-label="Primary navigation"><a href="/apps">APPS</a><a href="/blog">BLOG</a><a href="/social">SOCIAL</a></nav></header>
<main><div class="noise" aria-hidden="true"></div><section aria-labelledby="hero"><p class="eyebrow">${escapeHtml(content.eyebrow)}</p><h1 id="hero">${escapeHtml(content.tagline)}</h1><p class="lede">${escapeHtml(content.about)}</p><div class="actions"><a class="button" href="/apps">Enter the app nebula</a><a class="button secondary placeholder" href="${escapeHtml(content.discord)}" rel="noreferrer" target="_blank">Join me on Discord</a></div></section>
<section class="stories" aria-label="About and plans"><article><span>01 / ABOUT</span><h2>Building at the edge</h2><p>${escapeHtml(content.about)}</p></article><article><span>02 / PASSIONS</span><h2>What pulls me in</h2><p>${escapeHtml(content.passions)}</p></article><article><span>03 / FUTURE</span><h2>Where this goes</h2><p>${escapeHtml(content.future)}</p></article></section>
<section class="hire"><p class="eyebrow">AVAILABLE FOR HIRE</p><h2>${escapeHtml(content.hire)}</h2><div class="actions"><a class="button placeholder" href="${escapeHtml(content.discord)}" rel="noreferrer" target="_blank">Start a conversation on Discord</a></div></section></main>
<footer><div class="socials">${socials}</div><p>© ${new Date().getUTCFullYear()} ${escapeHtml(content.name)} · Visit <a href="${escapeHtml(content.otherSite)}">${escapeHtml(content.otherName)}’s world ↗</a></p></footer></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
