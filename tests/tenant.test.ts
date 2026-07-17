import { describe, expect, it } from "vitest";
import { resolveTenantRequest, selectTenantHostHeader } from "@/lib/tenant";

describe("resolveTenantRequest", () => {
  it("trusts forwarded host only when running on Vercel", () => {
    expect(selectTenantHostHeader("alexander.macscott.net", "127.0.0.1:3000", false)).toBe("alexander.macscott.net");
    expect(selectTenantHostHeader("127.0.0.1:3000", "alexander.macscott.net", true)).toBe("alexander.macscott.net");
  });
  it.each([
    ["scott.macscott.net", "scott"],
    ["alexander.macscott.net:443", "alexander"],
  ] as const)("maps %s to %s", (host, tenant) => {
    expect(resolveTenantRequest({ host, pathname: "/apps", search: "", vercelEnv: "production" })).toMatchObject({ tenant });
  });

  it("redirects an unknown host to Scott's canonical URL", () => {
    expect(resolveTenantRequest({ host: "evil.example", pathname: "/blog", search: "?x=1", vercelEnv: "production" })).toEqual({
      kind: "redirect",
      status: 301,
      location: "https://scott.macscott.net/blog?x=1",
    });
  });

  it("allows a local tenant override", () => {
    expect(resolveTenantRequest({ host: "localhost:3000", pathname: "/", search: "?tenant=alexander", vercelEnv: undefined })).toMatchObject({ tenant: "alexander" });
  });

  it("rejects tenant overrides in production", () => {
    expect(resolveTenantRequest({ host: "scott.macscott.net", pathname: "/", search: "?tenant=alexander", vercelEnv: "production" })).toMatchObject({ tenant: "scott" });
  });

  it("301 redirects production vercel aliases to the selected canonical host", () => {
    expect(resolveTenantRequest({ host: "macscott-sites.vercel.app", pathname: "/apps", search: "", vercelEnv: "production" })).toEqual({
      kind: "redirect",
      status: 301,
      location: "https://scott.macscott.net/apps",
    });
  });

  it("renders preview aliases noindex with production canonicals", () => {
    expect(resolveTenantRequest({ host: "feature-123.vercel.app", pathname: "/blog", search: "?tenant=alexander", vercelEnv: "preview" })).toMatchObject({
      kind: "rewrite",
      tenant: "alexander",
      noindex: true,
      canonicalOrigin: "https://alexander.macscott.net",
    });
  });
});
