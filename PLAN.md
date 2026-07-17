# Plan: MacScott Apps Showcase — twin 3D "orb nebula" sites
_Locked via grill — by Claude (Fable) + Scott. Workflow: Fable plans → Codex Sol adversarial review (MAX_ROUNDS=5) → Scott signs off → Sol builds (/codex-build) → Fable reviews the build. Rev 2 after Codex Round 1._

## Context
Scott and Alexander MacScott each publish apps/games from their own GitHub accounts (`XRAI-Studio` and `alexandermacscott-del`, both verified live — 4 and 5 public repos respectively). They want two premium, futuristic 3D showcase websites — `scott.macscott.net` and `alexander.macscott.net` — where each person's apps (plus jointly-built apps, which appear on BOTH sites) float as interactive glass orbs in a 3D nebula. End goal: push a game repo to GitHub and it appears on the live site automatically — no site edits.

**Trust model (governs security scope):** the only content publishers are the two brothers themselves, via repos they own. This is a personal showcase, not a multi-tenant SaaS — validation protects against mistakes and casual abuse, not nation-states.

## Goal
One Next.js codebase, deployed as one Vercel project with both subdomains attached. The site resolves the tenant from the hostname and renders the matching brother's site: a fast-loading personal landing page (about, passions, future plans, hire-me, Discord CTA) with nav **APPS / BLOG / SOCIAL** — APPS is the 3D orb nebula of his apps + shared apps in his color world; BLOG renders markdown posts published by his agent (Veronica for Scott, HAL for Alexander); SOCIAL lists his profiles. Apps are auto-discovered from GitHub via a topic tag + manifest file. Clicking an orb dives the camera into it and the app runs embedded (iframe) inside the site.

## Approach

### 1. Stack & scaffold
- Next.js (App Router, TypeScript), Tailwind, **React Three Fiber + drei + postprocessing** for the 3D nebula. Repo initialized in `C:\Users\thetr\SOURCE\repos\Apps_site`, pushed to new public repo **`XRAI-Studio/macscott-sites`**.
- One Vercel project; domains `scott.macscott.net` + `alexander.macscott.net` (Scott controls DNS → two CNAMEs to Vercel).

### 2. Multi-tenant by hostname — with correct cache isolation
- **Middleware rewrites by host to tenant-prefixed internal routes:** `scott.macscott.net/blog` → `/t/scott/blog`, `alexander.macscott.net/apps` → `/t/alexander/apps`. App routes live under `app/t/[tenant]/...` (NOT underscore-prefixed — `_folders` are private/non-routable in the App Router). Middleware **blocks direct public requests to `/t/...`** (redirect to the clean URL) so the prefix is internal-only. Tenant-in-URL makes ISR/static/RSC cache keys tenant-distinct by construction.
- **Middleware matcher excludes non-page requests:** `_next/*`, `/api/*`, static assets, favicon/icons/robots/sitemap — only page navigations are rewritten.
- Host resolution uses the Vercel-forwarded host, matched against an **allowlist** (the two production domains + `*.vercel.app` previews + localhost). Unknown hosts → redirect to `scott.macscott.net` (no content served under unrecognized hosts). Preview/localhost default to `scott` with a `?tenant=` override that is **disabled in production** (`VERCEL_ENV === 'production'`). **Preview hosts emit `noindex` + canonical URLs pointing at the production domain** — no duplicate-content SEO leak from `*.vercel.app`.
- Tenant config: name, tagline, palette, socials, agent name.
  - **Scott:** yellow/orange **fire** world (embers, warm glow). Agent: Veronica.
  - **Alexander:** **royal blue + electric blue** world (lightning, cool glow). Agent: HAL.

### 3. App auto-discovery (GitHub → catalog)
- An app opts in with GitHub topic **`macscott-app`** + a **`macscott.json`** manifest at repo root:
  ```json
  { "schemaVersion": 1, "title": "Void Runner", "description": "...",
    "owner": "alexander" | "scott" | "both",
    "liveUrl": "https://...", "embeddable": true,
    "screenshot": "screenshots/cover.png", "accent": "#4da6ff" }
  ```
- **Validation is strict (zod, `.strict()`):** `schemaVersion` required; length caps on strings; `liveUrl` HTTPS-only **and rejected if its origin matches either showcase domain** (prevents same-origin sandbox escape); `accent` a valid hex color; `screenshot` a normalized in-repo relative path; **unknown fields rejected** (typos surface as logged rejection reasons, not silent drops); `embeddable` defaults to `true` when `liveUrl` is present (embedding is the core experience; publishers are the owners — flip to `false` per-app when needed); invalid manifest → repo excluded with a logged, per-repo rejection reason.
- **Stable app identity:** slug = repo name (kebab-cased), disambiguated by owner on collision (`owner--repo`); never derived from the mutable `title`, so deep links survive renames of the display title. Catalog-wide uniqueness enforced.
- **Owner anti-spoof rule:** `owner` must equal the account the repo lives in, or `"both"`. A manifest in Scott's account claiming `owner: "alexander"` is rejected.
- **Catalog builder** (server-side): list each account's repos via REST (`per_page=100`, paginated; exclude forks and archived repos; cap 100 apps), filter by topic, then fetch `macscott.json` (and screenshot URL) **pinned to the repo's current default-branch commit SHA** so manifest+screenshot are never mixed across commits. Per-repo fetches use bounded concurrency + `Promise.allSettled`; one bad repo never breaks the catalog. Stable sort (owner, then title).
- **A GitHub PAT (fine-grained, public-repo read-only) is required in production** (`GITHUB_TOKEN` env in Vercel) — unauthenticated 60 req/hr is too fragile. Conditional requests (ETag) where easy. If GitHub errors mid-refresh, **serve the last good catalog** (stale-while-error).
- Caching: **one global catalog** built inside a single cached operation (`unstable_cache`/data-cache with tag `catalog`, revalidate ~1h); per-tenant filtering happens OUTSIDE the cached function — so tenant pages can never share/leak each other's fetch entries, and shared apps come from one source of truth.
- **Instant refresh:** `POST /api/revalidate` authenticated by a bearer secret **in a header** (never a query string). It invalidates the global `catalog` tag **and both tenants' route trees** (an owner change or shared app affects both sites). A tiny reusable GitHub Actions workflow (documented in README, ~6 lines) is added to app repos to call it on push — push a game → live in seconds; ISR is the no-Action fallback.
- Preview image fallback chain: manifest `screenshot` → GraphQL `openGraphImageUrl` (we have a token; **no HTML scraping**) → generated gradient orb from title + accent. Nothing ever renders broken.
- No `liveUrl` → orb appears in a dormant "in development" state (detail card + GitHub link, no play button).

### 4. Site map & the landing page (fast)
Public routes (per tenant, via the middleware rewrite):
- **`/` — Landing.** Lightweight and fast: NO WebGL/R3F bundle here. Hero with the brother's name + tagline, about/passions/future-plans sections, **"available for hire"** callout, prominent **Discord** CTA, socials strip in the footer. Futuristic style is *alluded to* with pure CSS: tenant-colored gradients, glow accents, subtle animated background (CSS-only), same fire vs. electric-blue palettes as the nebula. Budget: **≤ 110 KB gzipped JS on the landing route** (Next.js framework baseline only — zero three.js).
- **`/apps` — the Orb Nebula** (all heavy 3D lazy-loaded on this route only). **`/apps/[slug]` is a real route** for an app's detail/dive — deep-linkable, browser Back reverses the dive, refresh restores state, focus is trapped in the overlay and restored on exit.
- **`/blog` + `/blog/[slug]`** — markdown posts from `content/blog/scott/` and `content/blog/alexander/` (frontmatter: title, date, description — validated at build; duplicate slugs rejected; markdown rendered **without raw HTML** and with safe link schemes only). Veronica/HAL publish by committing a `.md` file → Vercel deploys → live. Statically generated; RSS per tenant.
  - Agent access: each agent uses a **fine-grained PAT scoped to this single repo, contents:write**. (Full PR + CODEOWNERS gating rejected as overkill for a two-person personal repo — see review log.)
- **`/social`** — full profile list. Both: Discord, GitHub, YouTube, X/Twitter, Twitch; Scott additionally: LinkedIn, Facebook, Instagram. Handles in tenant config (placeholders until Scott supplies URLs). Footer on every page repeats them.
- Nav on every page: **APPS · BLOG · SOCIAL** (+ logo → home). Drafted copy in each brother's voice ships in one editable content file per tenant.

### 5. The Orb Nebula (the experience)
- Fullscreen R3F canvas: app orbs as refractive glass spheres (drei `MeshTransmissionMaterial`) each containing its preview image on an inner plane, drifting in a slow orbital field with tenant-colored particle atmosphere (fire embers vs. electric arcs), bloom postprocessing, star/dust background.
- Interaction: cursor magnetic pull; drag to fling/orbit the camera; scroll to glide deeper; hover = glow + title label.
- **Click = dive:** camera animates INTO the orb → routes to `/apps/[slug]` → sphere interior becomes a fullscreen overlay hosting the app. Escape/Back reverses. Detail card (description, owner badge, GitHub link, play) on the way in; dormant orbs stop at the card.
- **Embedding policy:** iframe with `sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"` (no top-navigation), a restrictive Permissions-Policy `allow` list, and `referrerpolicy="no-referrer"`. Manifest `embeddable: false` (or absent `liveUrl`) → no iframe. **An "open in new tab ↗" control is always visible** on every embedded app — no fragile runtime frame-block detection; if an app turns out non-embeddable, flip `embeddable: false` in its manifest. Origins are inherently allowlisted: only manifests from the brothers' own repos, HTTPS-only, pass validation.
- **Accessibility + SEO:** the nebula is a progressive enhancement over a real, always-present semantic catalog. A **visible "grid view" toggle** on `/apps` switches between nebula and the semantic list — keyboard users get a view they can actually see (no focusable-but-invisible controls); WebGL-off users land on the grid automatically. Crawlers see every app.
- **Performance tiers:** full effects desktop; lite mode (fewer particles, standard material, no bloom) on mobile/weak GPUs via GPU-tier detection **with a `?tier=full|lite|off` override for deterministic testing**; CSS grid when WebGL is unavailable; WebGL context-loss handled (rebuild or drop to grid). `prefers-reduced-motion` respected.

### 6. Supporting surface & observability
- SEO metadata + OG images per tenant; footer cross-link to the other brother's site. No CMS, no database, no auth.
- **Observability (right-sized):** catalog builds emit structured logs — per-repo accepted/rejected + reason, GitHub rate-limit remaining, stale-serve events; revalidation calls logged. A private `GET /api/catalog-status` (same bearer secret) returns current catalog + last-build diagnostics. No alerting stack (personal site; Vercel logs suffice).

### 7. Ship pipeline
- Push to `main` on `XRAI-Studio/macscott-sites` → Vercel production; PRs → previews. README documents: the 2 DNS records + Vercel domain attach, "how to add an app" (topic + manifest + optional revalidate Action) for Alexander, and env vars (`GITHUB_TOKEN`, `REVALIDATE_SECRET`).

## Key decisions & tradeoffs
- **Hostname tenanting via middleware rewrite to `/_t/[tenant]/...`** — tenant is in the cache key by construction; no cross-domain cache leakage. Cost: one rewrite layer.
- **Topic + manifest auto-discovery** with strict zod validation, owner anti-spoof rule, SHA-pinned fetches, required read-only PAT, stale-on-error, and push-triggered revalidation. Eventual (≤1h) without the Action; seconds with it.
- **Iframe embedding with declared `embeddable` flag + always-visible new-tab escape** over runtime block-detection (cross-origin detection is unreliable).
- **Heavy WebGL aesthetic** mitigated by 3-tier ladder + semantic DOM catalog underneath (a11y/SEO) + context-loss handling.
- **Git-based blog, agents commit via repo-scoped fine-grained PATs** — the Veronica/HAL "connection" is a git push. PR-gating/CODEOWNERS declined: two-person personal repo, agents are the owners' own tools.
- **Landing is WebGL-free by design** with an explicit JS budget; three.js must not appear in the landing route's bundle (verify via `next build` route sizes).

## Testing (automated, right-sized)
Unit tests (vitest) for the risk core: manifest zod validation (incl. owner anti-spoof, HTTPS-only, showcase-origin rejection, unknown-field rejection, bad hex), tenant resolution from host (allowlist, unknown host, prod `?tenant=` rejection), slug stability/uniqueness, blog frontmatter validation + slug dedupe + markdown sanitization, catalog builder partial-failure behavior (mocked GitHub). **Plus one production-build integration test:** `next build && next start`, request `/`, `/blog`, `/rss.xml` with Scott's vs. Alexander's Host header and assert distinct tenant content (the cache-isolation boundary is tested, not assumed). Full e2e otherwise manual for v1.

## Risks / open questions
- Alexander's repos may lack manifests/live URLs initially → nebula seeds mostly "in development" orbs on day 1 (acceptable per grill).
- `macscott.net` DNS/registrar specifics unverified (Scott confirms he controls it).
- Exact social handles/Discord invite URLs pending from Scott (placeholders in tenant config).

## Out of scope
- No CMS, database, auth, analytics platform, alerting stack, or payments.
- No rebuilding/hosting the apps themselves — each app deploys itself; the site only embeds/links.
- No Hostinger pipeline; pure Vercel.
- No per-site layout divergence beyond palette/identity swap.
- No PR-gated blog workflow or CODEOWNERS (trust model: owners' own agents).

## Verification
1. `npm run dev` → localhost with `?tenant=scott` / `?tenant=alexander` shows fire vs. blue landing (about/hire-me/Discord/socials); `/apps` shows correct app sets (shared apps on both).
2. `npm test` → unit suite green (manifest, tenant, blog, catalog cases above).
3. `next build` route output: landing route has no three.js chunk and is within the JS budget; drop a test `.md` in `content/blog/scott/` → renders at `/blog`, absent from Alexander's `/blog`.
4. Tag a test repo `macscott-app` + manifest → `POST /api/revalidate` (header secret) → orb appears without a site deploy; invalid manifest → repo excluded, rejection reason visible in `/api/catalog-status`.
5. Click a playable orb → dive → `/apps/[slug]` → embedded app runs sandboxed → Back reverses; deep-link the slug URL directly → works. Dormant orb → card only. `embeddable:false` → new-tab only.
6. `?tier=lite` / `?tier=off` render lite mode / CSS grid deterministically; keyboard-only: tab through the semantic catalog, open an app, Escape out. (Real low-end-device pass = manual, post-deploy.)
7. Deploy to Vercel, attach both domains, verify each hostname serves only its tenant (spot-check `/blog` + RSS cross-domain), and an unknown-host request redirects to scott.macscott.net.

---
_Codex Sol reviews adversarially (read-only, MAX_ROUNDS=5); full argument in PLAN-REVIEW-LOG.md; on convergence + Scott's sign-off, Sol builds via /codex-build and Fable reviews the diff._
