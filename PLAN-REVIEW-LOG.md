# Plan Review Log: MacScott Apps Showcase — twin 3D "orb nebula" sites
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.
Reviewer model: gpt-5.6-sol (reasoning effort: medium) — codex-cli 0.144.1.

## Round 1 — Codex
Reviewed [PLAN.md](C:/Users/thetr/SOURCE/repos/Apps_site/PLAN.md); no implementation files exist yet.

1. **Host-based rendering conflicts with static generation/ISR:** `/blog`, RSS, metadata, and cached catalog responses can leak across tenants because the URL cache key is identical. Fix: middleware must allowlist and rewrite hosts to internal tenant-prefixed routes such as `/_tenants/scott/...`, with all caches tagged by tenant.

2. **Unknown hosts silently becoming Scott is unsafe:** spoofed `Host`, preview domains, and Vercel aliases could serve indexable Scott content. Fix: normalize Vercel’s trusted forwarded host, reject or redirect unknown hosts, and disable `?tenant=` outside development.

3. **“Instant refresh” is not automatic:** pushing to an app repository never calls the revalidation endpoint, so the stated zero-touch pipeline only refreshes after ISR expiry. Fix: add a signed GitHub webhook or reusable GitHub Action that invokes revalidation after manifest/topic changes.

4. **The revalidation endpoint design leaks its secret:** a GET query secret can enter logs, browser history, monitoring, and referrers. Fix: accept POST only, authenticate with an HMAC or bearer header, rate-limit it, and return no secret-bearing URLs.

5. **Catalog ownership is forgeable:** a Scott repository can declare `"owner":"alexander"` or `"both"` and publish onto Alexander’s site without an explicit policy. Fix: require owner to match the repository account or `both`, with exceptions in a reviewed allowlist.

6. **The manifest has no enforceable contract:** protocols, oversized strings, invalid colors, unknown fields, and future incompatible formats are unspecified. Fix: add `schemaVersion` and strict runtime validation with length limits, HTTPS-only URLs, normalized screenshot paths, and explicit rejection diagnostics.

7. **Iframe-block detection cannot work reliably:** cross-origin policy prevents inspecting the loaded document, and blocked frames may still emit `load`. Fix: make embeddability an explicit manifest field and always expose a visible “Open externally” action rather than claiming automatic detection.

8. **Embedded apps are a security boundary, but no policy is defined:** arbitrary apps could request sensors, open popups, navigate the top page, track users, or impersonate the surrounding site. Fix: use a restrictive `sandbox`, explicit Permissions Policy, `referrerpolicy`, persistent site chrome, and a documented per-app capability allowlist.

9. **CSP requirements are missing:** dynamically discovered iframe origins either fail under a strict `frame-src` policy or force an unsafe `https:` wildcard. Fix: build a validated origin allowlist into tenant-specific CSP and reject manifests whose origin is not approved.

10. **GitHub discovery is an unbounded N+1 operation:** pagination, archived/forked repos, search-index delay, API throttling, partial failures, and deterministic ordering are unspecified. Fix: paginate explicitly, filter repository states, cap catalog size, fetch with bounded concurrency, use `Promise.allSettled`, and sort by a stable key.

11. **The production plan treats a PAT as optional despite fragile rate limits:** cold builds and concurrent tenant revalidations can exhaust unauthenticated API quotas. Fix: require a least-privilege production token, use conditional requests, and retain stale catalog data when GitHub is unavailable.

12. **Manifest and screenshot reads can race across commits:** resolving both independently from the default branch can combine incompatible versions. Fix: resolve the repository’s current commit SHA once and fetch the manifest and screenshot from that immutable SHA.

13. **Scraping GitHub HTML for social previews is brittle and operationally unexplained.** Fix: use GitHub’s official GraphQL `openGraphImageUrl` field or omit that fallback in favor of the deterministic generated image.

14. **Direct agent commit access is a repository supply-chain hole:** credentials capable of adding blog files can also modify application code and deployment configuration. Fix: require PRs, CODEOWNERS approval, branch protection, and CI that rejects agent-authored changes outside the assigned blog directory.

15. **Markdown handling lacks a trust model:** raw HTML, unsafe link schemes, duplicate slugs, malformed dates, and invalid frontmatter are not addressed. Fix: validate frontmatter at build time, sanitize rendered output and URLs, reject duplicate slugs, and define draft/date/time-zone behavior.

16. **The iframe overlay has no durable navigation model:** refresh, deep links, browser Back, focus restoration, and multiple history entries are undefined. Fix: use a real `/apps/[repo]` route or rigorously specified history state with `popstate`, focus trapping, and focus restoration.

17. **The canvas is not an accessible or crawlable app catalog:** hover/click-only orbs exclude keyboard and screen-reader users, while app content is absent from SEO. Fix: render an equivalent semantic DOM catalog with keyboard controls regardless of WebGL availability.

18. **GPU fallback verification is invalid:** Chrome mobile emulation does not emulate weak GPUs, context loss, or real thermal constraints. Fix: provide deterministic tier overrides, test context creation/loss and runtime errors, and verify on representative physical low-end devices.

19. **Performance targets are not enforceable:** “90+ Lighthouse” and “lite mode” lack fixed conditions or bundle/render budgets. Fix: specify Lighthouse environment plus route JS, texture, draw-call, frame-time, and memory budgets enforced in CI where practical.

20. **Operational failure visibility is absent:** malformed manifests, stale catalogs, failed revalidations, GitHub throttling, and WebGL crashes could remain invisible. Fix: add structured server logs, per-repository rejection reasons, revalidation counters, client error reporting, and an alert for repeated catalog failures.

21. **The verification section is predominantly manual and misses the highest-risk boundary.** Fix: add automated tests for hostname rewrites and cache isolation, schema rejection, webhook authentication/replay, partial GitHub failure, markdown sanitization, iframe policy, and keyboard navigation.

VERDICT: REVISE
### Claude's response (Rev 2)
**Accepted & incorporated (1–8, 10–13, 15–18):** middleware rewrite to `/_t/[tenant]/...` for cache isolation; host allowlist + unknown-host redirect + prod `?tenant=` disabled; push-triggered revalidation via tiny reusable GitHub Action (ISR as fallback); POST + header bearer secret for revalidate; owner anti-spoof rule (owner must match repo account or "both"); strict zod manifest validation with schemaVersion/length caps/HTTPS-only/hex check; `embeddable` manifest flag + always-visible open-in-new-tab (runtime block-detection dropped); iframe sandbox + Permissions-Policy + no-referrer; discovery hardening (pagination, fork/archived filter, cap, bounded concurrency, allSettled, stable sort); PAT now REQUIRED in prod + ETag + stale-on-error; SHA-pinned manifest+screenshot fetches; HTML scraping dropped in favor of GraphQL `openGraphImageUrl`; markdown sanitization + frontmatter validation + slug dedupe; real `/apps/[slug]` route with Back/focus semantics; always-present semantic DOM catalog for a11y/SEO.

**Partially accepted:**
- **#9 CSP frame-src allowlist** → origins are already constrained (only HTTPS liveUrls from the brothers' own validated manifests). A dynamically-generated per-tenant CSP header adds real complexity for marginal gain under this trust model; sandbox + validation carry the load. Documented trust model in plan instead.
- **#18 GPU verification** → added deterministic `?tier=` overrides + context-loss handling; physical low-end-device testing kept as a manual post-deploy step (no device farm for a personal site).
- **#19 perf budgets** → concrete landing JS budget (≤110KB gzip, zero three.js) + build-output check; full CI-enforced frame-time/texture/memory budgets rejected as disproportionate.
- **#20 observability** → structured catalog logs with per-repo rejection reasons + `/api/catalog-status` diagnostics endpoint; alerting stack rejected (Vercel logs suffice for a personal site).
- **#21 tests** → vitest unit suite over the risk core (manifest/tenant/blog/catalog-failure); full e2e automation (webhook replay, iframe policy assertions, keyboard e2e) rejected for v1 — manual verification steps retained.

**Rejected with reason:**
- **#14 PR + CODEOWNERS + branch protection for agent commits** → overkill for a two-person personal repo where the "agents" are the owners' own tools; mitigation adopted instead: fine-grained PATs scoped to this single repo, contents:write. Logged as explicit out-of-scope.
