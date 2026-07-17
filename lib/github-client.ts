import {
  GitHubDeterministicError,
  GitHubTransientError,
  type GitHubCatalogClient,
  type GitHubRepo,
} from "@/lib/catalog-builder";

type GitHubRepoResponse = {
  name: string;
  default_branch: string;
  topics?: string[];
  fork: boolean;
  archived: boolean;
  html_url: string;
};

const etagCache = new Map<string, { etag: string; body: string; contentType: string | null }>();

export class GitHubRestClient implements GitHubCatalogClient {
  private rateLimitRemaining: number | null = null;

  constructor(private token?: string) {}

  getRateLimitRemaining() { return this.rateLimitRemaining; }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "macscott-sites",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  private async request(url: string, deterministic404 = false): Promise<Response> {
    let response: Response;
    try {
      const cached = etagCache.get(url);
      response = await fetch(url, { headers: this.headers(cached ? { "If-None-Match": cached.etag } : {}), signal: AbortSignal.timeout(10_000), cache: "no-store" });
      if (response.status === 304 && cached) {
        return new Response(cached.body, { status: 200, headers: { "Content-Type": cached.contentType ?? "application/json", ETag: cached.etag } });
      }
    } catch (error) {
      throw new GitHubTransientError(`GitHub request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null) this.rateLimitRemaining = Number(remaining);
    if (response.ok) {
      const etag = response.headers.get("etag");
      if (etag) etagCache.set(url, { etag, body: await response.clone().text(), contentType: response.headers.get("content-type") });
      return response;
    }
    if (response.status === 404 && deterministic404) throw new GitHubDeterministicError("macscott.json was not found at the pinned commit");
    if (response.status === 429 || response.status === 408 || response.status >= 500 || remaining === "0") {
      throw new GitHubTransientError(`GitHub transient response ${response.status}`, response.status);
    }
    throw new GitHubTransientError(`GitHub request failed with ${response.status}`, response.status);
  }

  async listRepos(account: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.request(`https://api.github.com/users/${encodeURIComponent(account)}/repos?per_page=100&page=${page}&sort=full_name`);
      const batch = await response.json() as GitHubRepoResponse[];
      repos.push(...batch.map((repo) => ({
        account,
        name: repo.name,
        defaultBranch: repo.default_branch,
        topics: repo.topics ?? [],
        fork: repo.fork,
        archived: repo.archived,
        htmlUrl: repo.html_url,
      })));
      if (batch.length < 100) break;
    }
    return repos;
  }

  async getCommitSha(account: string, repo: string, branch: string): Promise<string> {
    const response = await this.request(`https://api.github.com/repos/${encodeURIComponent(account)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`);
    const data = await response.json() as { sha?: string };
    if (!data.sha) throw new GitHubTransientError("GitHub commit response omitted sha");
    return data.sha;
  }

  async getManifest(account: string, repo: string, sha: string): Promise<string> {
    const response = await this.request(`https://raw.githubusercontent.com/${encodeURIComponent(account)}/${encodeURIComponent(repo)}/${encodeURIComponent(sha)}/macscott.json`, true);
    return response.text();
  }

  async getOpenGraphImage(account: string, repo: string): Promise<string | null> {
    if (!this.token) return null;
    let response: Response;
    try {
      response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query: "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){openGraphImageUrl}}", variables: { owner: account, name: repo } }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (error) {
      throw new GitHubTransientError(`GitHub GraphQL failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new GitHubTransientError(`GitHub GraphQL response ${response.status}`, response.status);
    const data = await response.json() as { data?: { repository?: { openGraphImageUrl?: string | null } }; errors?: unknown[] };
    if (data.errors) throw new GitHubTransientError("GitHub GraphQL returned errors");
    return data.data?.repository?.openGraphImageUrl ?? null;
  }
}
