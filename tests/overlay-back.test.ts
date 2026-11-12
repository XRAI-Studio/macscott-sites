import { describe, expect, it, vi } from "vitest";

describe("back to nebula", () => {
  it("opens the catalog when the app page was loaded directly", async () => {
    vi.resetModules();
    const { leaveAppOverlay } = await import("@/lib/catalog-visit");
    const router = { back: vi.fn(), push: vi.fn() };
    leaveAppOverlay(router);
    expect(router.push).toHaveBeenCalledWith("/apps");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("returns through history after arriving from the catalog", async () => {
    vi.resetModules();
    const { leaveAppOverlay, markCatalogVisited } = await import("@/lib/catalog-visit");
    const router = { back: vi.fn(), push: vi.fn() };
    markCatalogVisited();
    leaveAppOverlay(router);
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });
});
