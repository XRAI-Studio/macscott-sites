import { describe, expect, it } from "vitest";
import { appSlug } from "@/lib/slug";

describe("appSlug", () => {
  it("lowercases the account and repo verbatim", () => {
    expect(appSlug("XRAI-Studio", "Foo.Bar_game")).toBe("xrai-studio--foo.bar_game");
  });

  it("does not collapse distinct GitHub names", () => {
    expect(appSlug("owner", "foo.bar")).not.toBe(appSlug("owner", "foo-bar"));
  });

  it("is unique across owners", () => {
    expect(appSlug("owner-a", "game")).not.toBe(appSlug("owner-b", "game"));
  });
});
