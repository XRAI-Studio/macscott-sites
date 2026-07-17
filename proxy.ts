import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRequest, selectTenantHostHeader } from "@/lib/tenant";

export function proxy(request: NextRequest) {
  const forwardedHost = selectTenantHostHeader(request.headers.get("host"), request.headers.get("x-forwarded-host"), process.env.VERCEL === "1");
  const resolution = resolveTenantRequest({
    host: forwardedHost,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    vercelEnv: process.env.VERCEL_ENV,
  });

  if (resolution.kind === "redirect") {
    return NextResponse.redirect(new URL(resolution.location), resolution.status);
  }

  if (request.nextUrl.pathname === "/t" || request.nextUrl.pathname.startsWith("/t/")) {
    const parts = request.nextUrl.pathname.split("/");
    const cleanPath = `/${parts.slice(3).join("/")}`.replace(/\/$/, "") || "/";
    const clean = request.nextUrl.clone();
    clean.pathname = cleanPath;
    clean.searchParams.delete("tenant");
    return NextResponse.redirect(clean, 307);
  }

  const target = request.nextUrl.clone();
  target.pathname = `/t/${resolution.tenant}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
  target.searchParams.delete("tenant");
  const response = NextResponse.rewrite(target);
  response.headers.set("x-macscott-tenant", resolution.tenant);
  if (resolution.noindex) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    "/robots.txt",
    "/sitemap.xml",
    "/rss.xml",
    "/((?!api|_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)",
  ],
};
