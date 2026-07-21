# Plan: Nebula orb redesign — translucent tenant-effect bubbles
_Rev 4 (after Codex Sol Rounds 1–3; "core redesign is sound"). Act 1 (grill-with-docs) locked by Claude (Opus) + Scott. Scoped redesign of the existing `/apps` orb nebula; the repo's site-wide `PLAN.md` is unchanged and still authoritative for everything else._

## Context
The `/apps` orb nebula (`components/apps/orb-nebula.tsx`, wired by `components/apps/apps-experience.tsx`) renders each app as a refractive glass sphere tinted by its manifest `accent`, with a screenshot plane on its face (the "white card"), a black translucent label under it, and a strip of grid cards docked at the bottom. Orbs are pinned to a fixed spiral (3 layers / 4 rings), clamped behind `z=0` only to stop a preview card filling the viewport.

Scott wants the nebula to become a cleaner, more alive **color world per site**: translucent, faintly tenant-tinted bubbles that emanate **fire wisps (Scott)** or **electric-blue lightning arcing outward (Alexander)**, drifting freely within readable bounds, screenshot card and bottom strip gone. Removing the cards removes the z-clamp's reason to exist and opens the full volume — which forces real work on motion, occlusion, labels, depth-sorting, and GPU budget. Rev 4 is implementation-ready and reflects three adversarial review rounds.

## Glossary (canonical)
- **Tenant effect / color world** — one emanation style per site: fire on `scott.macscott.net`, electric-blue lightning on `alexander.macscott.net`. Every orb on a site wears it regardless of owner.
- **NebulaTheme** — a typed value **derived from the tenant id** (`lib/nebula-theme.ts`): `{ effect: "fire"|"lightning", palette:{core,mid,glow}, shellTint }`, palette sourced from the tenant `colors` in `content/tenants/*.ts`. Derived, not stored — no new manifest/tenant data field.
- **Bubble (orb)** — a translucent, faintly tenant-tinted Fresnel/iridescent shell. No screenshot inside.
- **Joint app (`owner:"both"`)** — appears on both sites; wears the host site's effect. No third color.
- **Orb label** — the black translucent title/status box under an orb; now managed by a small label manager under motion (§7).
- **Preview plane / "white card"** — screenshot on the orb face. **REMOVED.**
- **Docked card strip** — the visible bottom card row in nebula mode. **VISUALLY REMOVED**; the same `AppGrid` section stays in the DOM but `inert` in nebula mode (crawlable, out of tab order). The **visible GRID VIEW toggle is the keyboard/screen-reader path** (matches site-wide PLAN.md).

## Decisions locked in the grill
1. Effect attribution = **site/tenant**, not owner → no joint "third color".
2. Shell = **tenant-tinted translucent** Fresnel; per-app `accent` leaves the nebula (still in grid + detail).
3. Motion = **free-feeling wander, bounded for readability**; **occlusions are transient** — every orb periodically separates and is discoverable (not a "never overlaps" guarantee).

## Architecture (pooled + instanced, single simulation)
- **`lib/nebula-theme.ts`** — `nebulaTheme(tenant): NebulaTheme`, threaded `page.tsx` (`tenant` at line 11) → `AppsExperience` → `OrbNebula`.
- **`NebulaSimulation`** — one scene-root `useFrame`. Owns per-orb anchor/position/velocity typed arrays and **scratch allocated once per instance (`useRef`, not module-global)**. Runs the motion pipeline (§5), writes an `InstancedMesh` for shells (with a per-instance `aState` attribute), and updates pooled effect buffers + a `uniform vec3 orbCenters[24]`. **Zero per-frame heap allocation.**
- **Bubble shells** — one shared low-poly sphere geometry + one Fresnel/iridescent `ShaderMaterial`, tenant-tinted, one `InstancedMesh`. **Shell writes depth** so occlusion is depth-buffer-correct **without per-instance transparent sorting** (a single `InstancedMesh` cannot be back-to-front sorted per instance) — **WebGL2**: alpha-to-coverage (MSAA); **WebGL1/lite**: **ordered dither** with screen-stable coordinates (validate no shimmer under motion + bloom). Per-instance `aState` (status + hover/dim intensity) drives dormant-dim and hover-bright from the shared material. No idle point lights; at most one pooled hover light. **Effect objects (fire/lightning) are non-raycasting** (`raycast = () => null`) so they never intercept shell hover/click. The Canvas is `aria-hidden="true"` (decorative; Grid View is the sole a11y path).
- **Fire (Scott)** — one global `THREE.Points` cloud, fixed capacity. Attrs `{orbIndex, seed, birthPhase, radialDir}`; vertex shader reads the orb center, curls upward, ages; fragment samples a soft flame gradient. Additive, **`depthTest:true`** (wisps behind a shell are occluded by it — accepted), `depthWrite:false`, drawn after shells. Base wisps global; extra density only on the hovered orb. **Orb-center transport:** WebGL2 → `uniform vec3 orbCenters[24]` updated in place; WebGL1 → unrolled lookup or CPU-expanded per-particle centers (dynamic uniform-array indexing is unreliable on GLSL1).
- **Lightning (Alexander)** — one global segment buffer, **preallocated to exactly `24 orbs × 6 branches × 8 segments`**; only a staggered subset updates per frame; topology from a stable per-orb seed so flicker modulates **intensity** more than geometry (no per-frame rebuild). Screen-space thickness. Electric Fresnel veins on every shell always; outward arcs concentrate on the hovered orb.
- **Hybrid detail-on-hover** — subtle shader surface effect on every bubble; rich procedural detail only on the hovered/active orb → worst-case cost bounded independent of catalog size.
- **DOM layer** — the small label manager (§7) + the `inert` semantic link container (the existing `AppGrid`, a `<div>` of app links — markup unchanged).

## Approach (concrete steps)
1. **Remove the screenshot card** — delete `PreviewPlane` (`orb-nebula.tsx:13-21`) and its use (line 80).
2. **Hide the visible dock, keep crawlable links** — keep the `<section>` (`apps-experience.tsx:44`) rendered in nebula mode but visually hidden **and `inert`** (in DOM/HTML for crawlers, out of tab order / a11y tree); grid view (`catalog-full`) unchanged is the keyboard path. Add an empty-state DOM message (outside Canvas) when `apps.length === 0`.
3. **Thread NebulaTheme** — add `lib/nebula-theme.ts`; pass `tenant`/theme `page.tsx → AppsExperience → OrbNebula`.
4. **Shells** — shared geometry + instanced depth-writing Fresnel material; `Atmosphere` color ← theme glow (was `apps[0].accent`); drop per-orb point lights; per-instance `aState`.
5. **Motion pipeline (per frame, snapshot-based):**
   1. integrate low-frequency **curl-noise** steering around a **slug-seeded anchor** + weak return spring;
   2. **separation** = snapshot all positions → accumulate pairwise impulses (world-space de-penetration **plus a screen-space term in the current camera basis** so orbs that merely align on the camera ray also push apart) → **apply simultaneously** (Jacobi, 1–2 bounded iterations) — no index-order bias;
   3. **camera-relative bounds**: clamp into a `[minDist,maxDist]` band from the camera + inside a projected-screen margin + a camera-centered **exclusion sphere** (no near-plane crossing); **narrow zoom ≈5–11**;
   4. add a small **non-persistent** bob + pointer-parallax offset — and **reserve the max bob/parallax magnitude in the §5.3 margins** so the final rendered position can't cross the bounds/exclusion just solved.
   **Delta-clamped** (hidden-tab safe) and **speed-capped**. Fold the old drei `Float` into this loop.
6. *(rolled into §5 — Float folded in)*
7. **Label manager (small, centralized)** — project ≤24 orb centers each frame; **projected-rectangle rejection** (using **cached label dimensions**, not per-frame `getBoundingClientRect`) to suppress overlaps; hovered/focused labels always win; guarantee ≥1 label per screen region; hide labels behind the camera or beyond `maxDist`. **Positions applied via refs** (mutate `transform`), never per-frame React state. Keeps idle same-colored orbs discoverable. (No per-label raycast.)
8. **Reduced motion (hydration-safe gate)** — resolve the preference with **`useSyncExternalStore`** whose snapshot is **`boolean | null`**, with **`getServerSnapshot() → null`** (= "unresolved"). **Mount the Canvas only once the client snapshot is a boolean** (brief static shell while `null`) so not even one animated frame renders before the preference is known. When reduced: render a deliberate static rim/halo (no mid-flame freeze), stop all sim + effect updates.
9. **Tiers (simplified)** — initial detect-gpu classification (as today). **One-way full→lite downgrade with hysteresis** on sustained bad frame time; **no automatic lite→full upgrade, no shader prewarm**. lite: cheaper Fresnel (no iridescence) + reduced particles + **pooled low-segment arc / static lightning atlas** (Alexander keeps identity); bloom off/half-res, DPR ≤1.5. off: CSS grid (unchanged).
10. **Lifecycle & failure** — document ownership/disposal of pooled GL resources (geometry, shader materials, instanced attrs, points/segment buffers, flame atlas, hover light) and dispose on unmount; **named** `webglcontextlost`/`restored` handlers; **committed permanent grid fallback** on context loss **and on any shader compile/link failure**; **pause on `visibilitychange`** + clamp sim clock on resume; disable `OrbitControls` during a dive and freeze the selected orb until routing completes.

## Renderer matrix (WebGL2 vs WebGL1)
The existing check (`apps-experience.tsx:12`) accepts WebGL1. Contract: **WebGL2/MSAA** → alpha-to-coverage shell + `orbCenters[24]` uniform indexing + screen-space ribbon expansion; **WebGL1 (or lite)** → ordered-dither depth-writing shell + unrolled/CPU-expanded particle centers + GLSL1-safe ribbon expansion; **shader compile/link failure at any tier** → permanent grid fallback. Forced-WebGL1 is added to the resilience matrix.

## Budgets & scaling (right-sized to a ≤~10-app showcase)
Cap **visible orbs at 24** by the catalog's **existing `account`-then-`title` order** (`catalog-builder.ts:98`); any overflow lives in **Grid View only** — **no dimmed background pool** (dropped as ambiguous). When `apps.length > 24`, show a small visible chip **"24 of N shown · Grid View for all apps"** (covered by the a11y test). Fire particles ≤ ~1200 full / ~300 lite (shared cloud). Lightning geometry hard-capped and preallocated at `24×6×8` segments. DPR ≤1.5 full. Targets (measured **after shader warm-up, at a fixed viewport/DPR, on recorded reference devices**): p95 frame ≤ ~12 ms desktop-full / ≤ ~20 ms mobile-lite; **zero per-frame heap allocation**; draw calls ~flat in catalog size.

## Key decisions & tradeoffs
- Site-based effect; tenant-tinted **instanced depth-writing Fresnel shells** over per-orb refractive glass — coherent color world, correct occlusion without transparent sorting, cost independent of app count.
- Boids-lite anchored wander + snapshot separation (world **and** screen space) + camera-relative bounds — free-moving feel that makes occlusions transient and readability provable, and is tunable.
- Hybrid "detail only on hover" bounds worst-case GPU work.
- A11y model = visible **GRID VIEW** toggle as the keyboard/SR path + `inert` crawlable link list — **rejected** rebuilding orb interaction so DOM links are the canvas interaction authority (scope creep; grid view already is that path).
- **No ADR** (reversible, aesthetic). No CONTEXT.md implementation detail.

## Out of scope
Catalog pipeline, tenant resolution, embedding, routing, dive *semantics* (except disabling controls mid-dive), grid-view internals, stored manifest/tenant data — unchanged.

## Verification (quantified)
1. **Visual/behavioral:** `/apps?tenant=scott` → amber bubbles + fire wisps, no screenshot cards, no visible bottom strip; `?tenant=alexander` → blue bubbles + lightning arcs. Orbs wander and **separate — any overlap is transient**: define **edge-to-edge projected clearance** = `distance(projectedCenterA, projectedCenterB) − projectedRadiusA − projectedRadiusB`; acceptance = **every orb reaches ≥ 8 px clearance from every other orb at least once within a 30 s observation window, at each test viewport**. None recedes too small or crosses the camera. Hover intensifies + stabilizes (raises anchor strength); dormant orbs read dimmer via `aState`.
2. **A11y/SEO:** view-source / no-JS shows the semantic `AppGrid` links in nebula mode; the list is `inert` (Tab does not land on invisible items); Canvas is `aria-hidden`; GRID VIEW toggle is keyboard-operable with **visible focus** and announces the active view; the "24 of N shown" chip is present/announced when overflowing; empty catalog shows a DOM message.
3. **Perf:** at **100 catalog entries**, assert semantic rendering + **capped** GPU work (≤24 simulated, flat draw calls, no per-frame alloc); test **simulation correctness at its real max of 24** and at 1/10; across full/lite/off + reduced on both tenants and a mobile viewport. p95 recorded per the reproducible protocol above.
4. **Resilience:** repeated NEBULA⇄GRID toggles; hidden-tab resume (no tunneling); forced WebGL context loss → permanent grid fallback; **forced WebGL1** path (ordered-dither shell + CPU/unrolled centers) renders correctly; shader compile failure → grid fallback; `prefers-reduced-motion` → static rim, **no animated frame before mount**; `?tier=lite` keeps lightning identity; depth-sort/dither shimmer on intersecting shells visually validated under motion + bloom.
5. **Regression tests:** `nebulaTheme(tenant)` maps each id to the right effect/palette; a component test asserts the semantic app links remain present (and `inert`) in nebula-mode render.

## Files touched
`components/apps/orb-nebula.tsx` (major rewrite), `components/apps/apps-experience.tsx` (dock→inert+hidden, empty state, theme prop, `useSyncExternalStore` reduced-motion, gated Canvas mount), `app/t/[tenant]/apps/page.tsx` (pass tenant/theme), new `lib/nebula-theme.ts`, new modules under `components/apps/` (`nebula-simulation`, shell material, `fire-points`, `lightning-segments`, `label-manager`), `app/globals.css` (inert/visually-hidden catalog, label + empty-state styling), tests in the existing suite.
