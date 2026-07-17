import { describe, expect, it, vi } from "vitest";
import { buildCatalog, GitHubTransientError, type GitHubCatalogClient } from "@/lib/catalog-builder";

const manifest = JSON.stringify({
  schemaVersion: 1,
  title: "Shared Spark",
  description: "A shared app",
  owner: "both",
  accent: "#ffaa00",
});

function client(overrides: Partial<GitHubCatalogClient> = {}): GitHubCatalogClient {
  return {
    listRepos: vi.fn(async (account) => [{ account, name: "Spark.Game", defaultBranch: "main", topics: ["macscott-app"], fork: false, archived: false, htmlUrl: `https://github.com/${account}/Spark.Game` }]),
    getCommitSha: vi.fn(async () => "abc123"),
    getManifest: vi.fn(async () => manifest),
    getOpenGraphImage: vi.fn(async () => null),
    ...overrides,
  };
}

describe("buildCatalog", () => {
  it("pins manifest and screenshot work to the resolved SHA", async () => {
    const api = client();
    const result = await buildCatalog(api, ["XRAI-Studio"]);
    expect(api.getManifest).toHaveBeenCalledWith("XRAI-Studio", "Spark.Game", "abc123");
    expect(result.apps[0].slug).toBe("xrai-studio--spark.game");
  });

  it("excludes deterministic invalid manifests and records a reason", async () => {
    const api = client({ getManifest: vi.fn(async () => "{\"schemaVersion\": 2}") });
    const result = await buildCatalog(api, ["XRAI-Studio"]);
    expect(result.apps).toHaveLength(0);
    expect(result.diagnostics.rejected[0]).toMatchObject({ repo: "XRAI-Studio/Spark.Game" });
  });

  it("aborts the entire refresh on a transient per-repo failure", async () => {
    const api = client({ getManifest: vi.fn(async () => { throw new GitHubTransientError("rate limited"); }) });
    await expect(buildCatalog(api, ["XRAI-Studio"])).rejects.toThrow(GitHubTransientError);
  });

  it("aborts on account listing failure", async () => {
    const api = client({ listRepos: vi.fn(async () => { throw new GitHubTransientError("GitHub unavailable"); }) });
    await expect(buildCatalog(api, ["XRAI-Studio", "alexandermacscott-del"])).rejects.toThrow(GitHubTransientError);
  });

  it("sorts stably by owner then title", async () => {
    const api = client();
    const result = await buildCatalog(api, ["XRAI-Studio", "alexandermacscott-del"]);
    expect(result.apps.map((app) => app.account)).toEqual(["alexandermacscott-del", "XRAI-Studio"]);
  });
});
