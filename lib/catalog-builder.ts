import pLimit from "p-limit";
import { parseManifest, type AppManifest } from "@/lib/manifest";
import { appSlug } from "@/lib/slug";

export class GitHubTransientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GitHubTransientError";
  }
}

export class GitHubDeterministicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubDeterministicError";
  }
}

export type GitHubRepo = {
  account: string;
  name: string;
  defaultBranch: string;
  topics: string[];
  fork: boolean;
  archived: boolean;
  htmlUrl: string;
};

export interface GitHubCatalogClient {
  listRepos(account: string): Promise<GitHubRepo[]>;
  getCommitSha(account: string, repo: string, branch: string): Promise<string>;
  getManifest(account: string, repo: string, sha: string): Promise<string>;
  getOpenGraphImage(account: string, repo: string): Promise<string | null>;
  getRateLimitRemaining?(): number | null;
}

export type CatalogApp = AppManifest & {
  slug: string;
  account: string;
  repo: string;
  githubUrl: string;
  commitSha: string;
  screenshotUrl: string | null;
};

export type CatalogDiagnostics = {
  builtAt: string;
  rateLimitRemaining?: number | null;
  accepted: { repo: string; slug: string }[];
  rejected: { repo: string; reason: string }[];
};

export type Catalog = { apps: CatalogApp[]; diagnostics: CatalogDiagnostics };

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function buildCatalog(client: GitHubCatalogClient, accounts: string[]): Promise<Catalog> {
  const listed = await Promise.all(accounts.map((account) => client.listRepos(account)));
  const repos = listed.flat()
    .filter((repo) => !repo.fork && !repo.archived && repo.topics.includes("macscott-app"))
    .slice(0, 100);
  const diagnostics: CatalogDiagnostics = { builtAt: new Date().toISOString(), accepted: [], rejected: [] };
  const limit = pLimit(6);

  const settled = await Promise.all(repos.map((repo) => limit(async (): Promise<CatalogApp | null> => {
    const repoId = `${repo.account}/${repo.name}`;
    try {
      const sha = await client.getCommitSha(repo.account, repo.name, repo.defaultBranch);
      const raw = await client.getManifest(repo.account, repo.name, sha);
      const manifest = parseManifest(JSON.parse(raw), repo.account);
      const screenshotUrl = manifest.screenshot
        ? `https://raw.githubusercontent.com/${repo.account}/${repo.name}/${sha}/${manifest.screenshot.split("/").map(encodeURIComponent).join("/")}`
        : await client.getOpenGraphImage(repo.account, repo.name);
      const app: CatalogApp = {
        ...manifest,
        slug: appSlug(repo.account, repo.name),
        account: repo.account,
        repo: repo.name,
        githubUrl: repo.htmlUrl,
        commitSha: sha,
        screenshotUrl,
      };
      diagnostics.accepted.push({ repo: repoId, slug: app.slug });
      console.info(JSON.stringify({ event: "catalog.repo.accepted", repo: repoId, slug: app.slug }));
      return app;
    } catch (error) {
      if (error instanceof GitHubTransientError) throw error;
      const message = reason(error);
      diagnostics.rejected.push({ repo: repoId, reason: message });
      console.warn(JSON.stringify({ event: "catalog.repo.rejected", repo: repoId, reason: message }));
      return null;
    }
  })));

  diagnostics.rateLimitRemaining = client.getRateLimitRemaining?.() ?? null;
  const apps = settled.filter((app): app is CatalogApp => app !== null)
    .sort((a, b) => a.account.toLowerCase().localeCompare(b.account.toLowerCase()) || a.title.localeCompare(b.title));
  return { apps, diagnostics };
}
