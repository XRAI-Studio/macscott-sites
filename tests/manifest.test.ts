import { describe, expect, it } from "vitest";
import { parseManifest } from "@/lib/manifest";

const valid = {
  schemaVersion: 1,
  title: "Void Runner",
  description: "A fast trip through the dark.",
  owner: "alexander",
  liveUrl: "https://void.example.com/play",
  screenshot: "screenshots/cover.png",
  accent: "#4da6ff",
};

describe("parseManifest", () => {
  it("accepts a valid manifest and defaults embeddable to true with liveUrl", () => {
    expect(parseManifest(valid, "alexandermacscott-del").embeddable).toBe(true);
  });

  it.each([
    ["owner spoof", { ...valid, owner: "scott" }],
    ["insecure URL", { ...valid, liveUrl: "http://void.example.com" }],
    ["showcase origin", { ...valid, liveUrl: "https://scott.macscott.net/apps" }],
    ["unknown field", { ...valid, embedable: true }],
    ["bad hex", { ...valid, accent: "blue" }],
    ["escaping screenshot", { ...valid, screenshot: "../cover.png" }],
  ])("rejects %s", (_label, manifest) => {
    expect(() => parseManifest(manifest, "alexandermacscott-del")).toThrow();
  });

  it("allows shared ownership from either account", () => {
    expect(parseManifest({ ...valid, owner: "both" }, "XRAI-Studio").owner).toBe("both");
  });
});
