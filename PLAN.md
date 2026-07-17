# Plan: MacScott Apps Showcase — twin 3D "orb nebula" sites
_Locked via grill — by Claude (Fable) + Scott. Workflow: Fable plans → Codex Sol adversarial review (MAX_ROUNDS=5) → Scott signs off → Sol builds (/codex-build) → Fable reviews the build._

## Context
Scott and Alexander MacScott each publish apps/games from their own GitHub accounts (`XRAI-Studio` and `alexandermacscott-del`, both verified live — 4 and 5 public repos respectively). They want two premium, futuristic 3D showcase websites — `scott.macscott.net` and `alexander.macscott.net` — where each person's apps (plus jointly-built apps, which appear on BOTH sites) float as interactive glass orbs in a 3D nebula. End goal: push a game repo to GitHub and it appears on the live site automatically — no site edits.

## Goal
One Next.js codebase, deployed as one Vercel project with both subdomains attached. The site reads the request hostname and renders the matching brother's site: a fast-loading personal landing page (about, passions, future plans, hire-me, Discord CTA) with nav **APPS / BLOG / SOCIAL** — APPS is the 3D orb nebula of his apps + shared apps in his color world; BLOG renders markdown posts published by his agent (Veronica for Scott, HAL for Alexander); SOCIAL lists his profiles. Apps are auto-discovered from GitHub via a topic tag + manifest file. Clicking an orb dives the camera into it and the app runs embedded (iframe) inside the site.

## Approach

### 1. Stack & scaffold
- Next.js (App Router, TypeScript), Tailwind, **React Three Fiber + drei + postprocessing** for the 3D nebula. Repo initialized in `C:\Users\thetr\SOURCE\repos\Apps_site`, pushed to new public repo **`XRAI-Studio/macscott-sites`**.
- One Vercel project; domains `scott.macscott.net` + `alexander.macscott.net` (Scott controls DNS → two CNAMEs to Vercel).

### 2. Multi-tenant by hostname
- Middleware/root-layout reads `Host` header → tenant = `scott` | `alexander` (unknown host → scott, plus a local `?tenant=` override for dev).
- Tenant config: name, tagline, palette, filter rule.
  - **Scott:** yellow/orange **fire** world (embers, warm glow).
  - **Alexander:** **royal blue + electric blue** world (lightning, cool glow).

### 3. App auto-discovery (GitHub → catalog)
- An app opts in with GitHub topic **`macscott-app`** + a **`macscott.json`** manifest at repo root:
  ```json
  { "title": "Void Runner", "description": "...", "owner": "alexander" | "scott" | "both",
    "liveUrl": "https://...", "screenshot": "screenshots/cover.png", "accent": "#4da6ff" }
  ```
- Server-side catalog builder queries the GitHub API for topic-tagged repos of both accounts, fetches each manifest, and normalizes entries. Cached via Next ISR (revalidate ~1h) + an on-demand `/api/revalidate?secret=` endpoint for instant refresh. Public API only (no token required; optional PAT env var to raise rate limits).
- Preview image fallback chain: manifest `screenshot` → repo OpenGraph/social-preview image → generated gradient orb from title + accent. Nothing ever renders broken.
- No `liveUrl` → orb still appears in a distinct dormant "in development" state (detail card + GitHub link, no play button).

### 4. Site map & the landing page (fast)
Routes (per tenant, chosen by hostname):
- **`/` — Landing.** Lightweight and fast: NO WebGL/R3F bundle here. Hero with the brother's name + tagline, about/passions/future-plans sections, **"available for hire"** callout, prominent **Discord** CTA, socials strip in the footer. Futuristic style is *alluded to* with pure CSS: tenant-colored gradients, glow accents, subtle animated background (CSS/light canvas particles, ~zero JS weight), same fire vs. electric-blue palettes as the nebula. Target: instant paint, high Lighthouse.
- **`/apps` — the Orb Nebula** (all heavy 3D code lazy-loaded on this route only).
- **`/blog` + `/blog/[slug]` — agent-published blog.** Posts are markdown files in the site repo under `content/blog/scott/` and `content/blog/alexander/` (frontmatter: title, date, description). Veronica and HAL publish by committing a `.md` file → Vercel auto-deploys → post is live. Each brother's site shows only his folder. Statically generated, RSS feed per tenant.
- **`/social` — SOCIAL page**: full profile list with links. Footer on every page repeats them. Platforms — both: Discord, GitHub, YouTube, X/Twitter, Twitch; Scott additionally: LinkedIn, Facebook, Instagram. Handles/URLs live in the tenant config (placeholders until Scott supplies exact URLs).
- Nav menu on every page: **APPS · BLOG · SOCIAL** (+ logo → home).
- Landing/about copy: build ships drafted copy in each brother's voice (Scott: XRAI Studio / agentic AI builder; Alexander: game developer), in one editable content file per tenant, marked for review.

### 5. The Orb Nebula (the experience)
- Fullscreen R3F canvas: app orbs as refractive glass spheres (drei `MeshTransmissionMaterial`) each containing its preview image on an inner plane, drifting in a slow orbital field with tenant-colored particle atmosphere (fire embers vs. electric arcs), bloom postprocessing, star/dust background.
- Interaction: cursor exerts magnetic pull; drag to fling/orbit the camera through the field; scroll to glide deeper; orb hover = glow + title label.
- **Click = dive:** camera animates INTO the orb, glass swallows the view, and the sphere interior becomes a fullscreen overlay — the app's `liveUrl` in an iframe with a floating "back to nebula" control. Escape/back reverses the dive. Detail card (description, owner badge, GitHub link, play) shown on the way in; "in development" orbs stop at the card.
- Shared (`owner: both`) orbs get a dual-tone signature visible in both worlds.
- **Performance tiers:** full effects on desktop; lite mode on mobile/weak GPUs (fewer particles, standard material instead of transmission, no bloom) via GPU-tier detection; pure CSS animated card grid only when WebGL is unavailable. `prefers-reduced-motion` respected.

### 6. Supporting surface
- SEO metadata + OG images per tenant; footer cross-link to the other brother's site. No CMS, no auth, no database — blog is git-based markdown.

### 7. Ship pipeline
- Push to `main` on `XRAI-Studio/macscott-sites` → Vercel production; PRs → previews. Document the 2 DNS records + Vercel domain attach steps in README, plus "how to add an app" (topic + manifest) for Alexander.

## Key decisions & tradeoffs (for Codex to bite)
- **One codebase / one Vercel project / hostname tenanting** over two projects — zero duplication; risk: tenant cache-splitting must key on host (ISR/data-cache correctness across two domains on one deployment).
- **Topic + manifest auto-discovery with ISR** over site-repo manifest or webhook CI — zero-touch publishing; risks: GitHub unauthenticated rate limits (60/hr/IP) at build/revalidate, manifest schema validation of untrusted-ish JSON, eventual (≤1h) rather than instant appearance.
- **Iframe embedding** over link-out — apps must be embeddable (no `X-Frame-Options`/CSP `frame-ancestors` blocking; mixed-content HTTPS). Fallback: if embed is blocked, auto-degrade that app to open-in-new-tab.
- **Heavy WebGL aesthetic (transmission material + bloom)** — the premium look vs. GPU cost; mitigated by the 3-tier performance ladder.
- **`owner: both` in a single repo's manifest** decides shared status — no cross-repo dedup logic needed.
- **Landing is WebGL-free by design** — the premium 3D lives only at `/apps`; landing speed beats spectacle there. Route-level code-splitting must actually keep three.js out of the landing bundle (Codex: verify the dynamic-import boundary).
- **Git-based blog (agents commit markdown)** over an API feed — the Veronica/HAL "connection" is a git push; no endpoints to build or secure. Tradeoff: agents need commit access to the site repo (fine — both brothers own it).

## Risks / open questions
- Alexander's repos may lack manifests/live URLs initially → nebula seeds mostly "in development" orbs on day 1 (acceptable per grill).
- `macscott.net` DNS/registrar specifics unverified (Scott confirms he controls it).
- GitHub social-preview images aren't exposed by the REST API directly (OG scrape needed for fallback #2) — implementation detail Codex should sanity-check.

## Out of scope
- No CMS, database, auth, analytics platform, or payments.
- No rebuilding/hosting the apps themselves — each app deploys itself; the site only embeds/links.
- No Hostinger pipeline (that's the separate game pipeline); this is pure Vercel.
- No custom per-site layouts beyond palette/identity swap (same engine both sites).

## Verification
1. `npm run dev` → `localhost:3000?tenant=scott` and `?tenant=alexander` show fire vs. blue landing pages (about/hire-me/Discord CTA/socials), and `/apps` shows correct app sets (shared apps in both).
1b. Landing page loads with no three.js in its JS bundle (check `next build` route sizes) and scores 90+ Lighthouse performance. Drop a test markdown file in `content/blog/scott/` → post renders at `/blog`.
2. Tag a test repo with `macscott-app` + manifest → hit `/api/revalidate` → orb appears without a site deploy.
3. Click a playable orb → dive animation → embedded app runs → back-out works. Orb without `liveUrl` → dormant card. Embed-blocked URL → new-tab fallback.
4. Chrome DevTools mobile emulation → lite mode; WebGL disabled → CSS grid fallback.
5. Deploy to Vercel, attach both domains, verify both live hostnames render their own tenant.

---
_After approval: PLAN.md is written to the repo, Codex Sol reviews adversarially (read-only, up to 5 rounds) with the full argument logged in PLAN-REVIEW-LOG.md; on convergence + Scott's sign-off, Sol builds via /codex-build and Fable reviews the diff._
