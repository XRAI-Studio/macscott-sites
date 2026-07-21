# Plan Review Log: Nebula orb redesign — translucent tenant-effect bubbles
Act 1 (grill-with-docs) complete — plan locked in `ORB-REDESIGN-PLAN.md`, glossary captured. MAX_ROUNDS=5.
Reviewer: Codex Sol (`gpt-5.6-sol`, reasoning=medium, codex-cli 0.144.1). Read-only every round.
Thread: `019f80b8-2983-7062-8707-cebc7ef2d553`.

## Round 1 — Codex Sol (VERDICT: REVISE)
Thorough, high-value critique. Full text archived by Claude. Key findings by category:

**Correctness / product regressions**
- Removing the dock strips the only semantic app links from nebula-mode HTML — orbs are pointer-only (no focus/keyboard/crawl). a11y + SEO regression.
- Soft world bounds don't prevent orb-vs-orb overlap, so "none stays occluded" can't follow — needs explicit separation.
- Fixed world x/y/z bounds ≠ readable bounds once OrbitControls autorotates and SmoothZoom (3.2–14) changes camera distance — must constrain camera-relative distance / projected size.
- Opening +z lets an orb cross the camera/near-plane — needs a camera-centered exclusion sphere.
- "Label unchanged" is false under free depth motion — overlapping / off-screen / behind-camera labels become inevitable; label handling is in-scope.

**Frame budget / GPU**
- `MeshTransmissionMaterial` + `backside` = 2 extra scene renders *per orb*; catastrophic as catalog grows. Use a shared Fresnel/iridescent shell instead.
- Per-orb point light, per-orb sphere geometry, per-particle draw calls, per-arc line objects, geometry rebuilt on jittered intervals (GC spikes), uncapped bloom at DPR 1.75 — all need pooling/instancing/fixed buffers and hard tier budgets.
- Additive `depthWrite:false` glows through bubbles/labels — define depth/render-order.

**R3F lifecycle**
- Per-frame `Vector3` alloc; per-orb timers + state updates; no ownership/cleanup for pooled GL resources; random positions change on remount/tier-switch/context-recovery and can start overlapped; per-orb `useFrame` overhead; anonymous context-loss handler with untested restoration.

**Motion math**
- Soft inward accel is a spring (can tunnel/oscillate/accumulate at walls), boundary forces bias occupancy, collision repulsion jitters, `Float` adds an unaccounted transform, composition order undefined, dive vs OrbitControls conflict, moving click targets escape between down/up.

**Reduced motion / tiers / failure**
- reduced-motion starts `false` until client effect → initial flicker; "freeze" leaves an ugly mid-flame frame; lite Alexander loses its lightning identity; detect-gpu async upgrade compiles shaders mid-interaction; context-loss fallback permanence undefined; no empty-catalog state; no `visibilitychange` pause (hidden-tab resume tunnels).

**Scope / verification**
- "One-line guard" understates plumbing (page passes no tenant content; `TenantContent` has no effect field); "no new data fields" conflicts with adding `effect`; visual verification isn't quantified; no regression tests for semantic links / tenant theme.

**Constructive proposals:** pooled stylized effects + cheap instanced Fresnel shells; global `Points` cloud for fire; single pooled segment buffer for lightning; **hybrid** (subtle shader on every bubble + rich procedural detail only on the hovered orb → worst-case cost independent of catalog size); **boids-lite** motion (seeded anchor + curl noise + weak return spring + pairwise separation + camera-relative frustum forces); and a single `NebulaSimulation` + one instanced renderer + one effect renderer + one DOM label/link layer.

### Claude's response (final arbiter)
**Accepted (folded into ORB-REDESIGN-PLAN.md rev 2):** the a11y/SEO semantic-link regression; explicit pairwise separation for de-occlusion; camera-relative bounds + camera exclusion sphere + narrowed zoom; label culling/overlap handling now in-scope; replace per-orb transmission glass with shared **instanced Fresnel/iridescent shells**; drop idle point lights; **global pooled `Points` fire** + **global pooled segment-buffer lightning** with fixed-capacity buffers (no interval geometry rebuilds); **single `NebulaSimulation`** hot loop with module-level scratch (zero per-frame alloc); deterministic **slug-seeded placement**; **boids-lite** motion (anchor + curl noise + return spring + separation) with delta-clamp + speed-cap + defined pipeline order; fold `Float` bob into the sim; disable OrbitControls during dive; **synchronous reduced-motion init** + deliberate static rim/halo (no mid-flame freeze); lite tier keeps a **pooled low-segment arc / atlas** so Alexander stays lightning; defer detect-gpu upgrade to idle + shader prewarm + runtime downgrade; named context handlers + **committed permanent grid fallback**; empty-state DOM; `visibilitychange` pause + clock clamp; derive a **typed `NebulaTheme` from tenant id** (no stored data field — resolves the "no new data fields" conflict); quantified verification thresholds + stress matrix + regression tests.

**Right-sized (accepted in spirit, scaled to a ≤~10-app personal showcase):** no full screen-space label manager — just behind-camera/max-distance cull + show hovered + nearest-N; no full physics substepping engine — delta-clamp + speed-cap + positional separation suffice; budgets set to realistic caps (visible ≤24 with a dimmed non-interactive background pool beyond) rather than a 100-orb worst case.

**Rejected (logged):** rebuilding orb interaction so *DOM links are the canvas interaction authority* — scope creep beyond Scott's request and beyond the established site plan, which already designates the **grid-view toggle** as the keyboard/crawler path. Instead I keep that model and add an always-present *visually-hidden* semantic `<ul>` of app links in nebula mode, which fully addresses the crawl/keyboard concern at a fraction of the cost.

## Round 2 — Codex Sol (VERDICT: REVISE)
Confirmed rev 2 resolved 16 Round-1 items (instanced Fresnel shells, pooled effects, centralized sim/no per-frame alloc, explicit budgets, camera-relative bounds, visibility pause, slug-seeded anchors, Float folded in, static reduced-motion treatment, lite lightning identity, no idle lights, named context handlers + permanent fallback, derived NebulaTheme, empty state, dive/control conflict, quantified verification).

Remaining, all accepted by Claude:
- **Blocker — invisible tabbable links:** an sr-only-but-tabbable list sends focus to invisible elements; "established a11y model" claim was loose (current dock is visible).
- **Blocker — projected occlusion:** world-space de-penetration doesn't stop two separated orbs aligning on the camera ray, so "none stays occluded" is unprovable.
- **Blocker — SSR-unsafe reduced-motion init:** `useState(() => window.matchMedia())` runs on the server (AppsExperience SSRs) → hydration mismatch.
- **New:** transparent `InstancedMesh` can't sort shells per-instance; fire render-order needs depth-buffer spec (and DOM labels aren't washed out by Canvas order); final bob/parallax offset can violate the bounds just solved; in-index-order de-penetration is directionally biased (use snapshot→accumulate→apply); nearest-N labels still overlap and shared tenant color makes idle orbs indistinguishable; particle shader's orb-center transport unspecified; module-level scratch is shared across Canvas instances/tests; dormant/hover shell states need per-instance attributes; lightning "6 branches" doesn't cap segments/vertices; background-pool selection/behavior ambiguous.
- **Over-corrections (mine):** tier upgrade + prewarm + adaptive downgrade + 100-app sim machinery is too much for a ~10-app site; 100-app *simulation* test conflicts with the 24 cap; "no label manager" was premature — a small centralized manager for ≤24 labels is cheap and fixes several issues.

### Claude's response (final arbiter) → rev 3
Accept all. Concretely: (1) a11y — semantic `<ul>` stays in the DOM for crawlers but is `inert`/removed from tab order in nebula mode; the **visible GRID VIEW toggle is the documented keyboard/screen-reader path** (matches the site-wide PLAN.md); test visible focus. (2) Add a **screen-space separation** term in the current camera basis and **soften wording** to "occlusions are transient; every orb periodically separates and is discoverable." (3) Replace the init with **`useSyncExternalStore`** (server snapshot = reduced) and don't mount the Canvas until resolved. (4) Shell shader **writes depth** via alpha-to-coverage/dither so occlusion is depth-buffer-correct without per-instance transparent sorting; fire `depthTest:true`; drop the "washed-out labels" line. (5) **Reserve max bob/parallax** in the margin during constraint solving. (6) Separation = **snapshot → accumulate → simultaneous apply**, 1–2 bounded Jacobi iterations. (7) Adopt the **small centralized label manager** (project ≤24 centers, projected-rect rejection, hovered/focused always win, ≥1 label per screen region). (8) `uniform vec3 orbCenters[24]` updated in place. (9) Scratch allocated **once per `NebulaSimulation` instance** (useRef), not module-global. (10) Per-instance `aState` attribute for dim/hover. (11) Cap lightning at **24×6×8 segments**, preallocated. (12) **Drop the dimmed background pool**: cap visible at 24 by the existing stable sort (owner, title); remainder lives in Grid View only. (13) Simplify tiers: initial detect-gpu classification + **one-way full→lite** downgrade with hysteresis; **no auto lite→full**, no prewarm. (14) Perf tests: 100 entries for *semantic + capped-GPU* only; simulation correctness tested at its real max of 24.

## Round 3 — Codex Sol (VERDICT: REVISE)
"The core redesign is sound." Confirmed resolved: inert links + Grid View keyboard path, transient/projected occlusion, depth strategy (no per-instance alpha sort), snapshot separation, bob/parallax margin, centralized labels, particle centers/scratch/aState/lightning capacity concrete, hard 24 cap, reduced tier + perf-test scope. Remaining, all accepted:
- **reduced-motion contradiction:** a `false` server snapshot can't distinguish "resolved false" from "unresolved," but Canvas mount waits on resolution → snapshot must be `boolean|null`, `getServerSnapshot()→null`, mount only when boolean.
- **WebGL1 contract:** feature check accepts WebGL1 (`apps-experience.tsx:12`) but alpha-to-coverage needs WebGL2 MSAA and dynamic `orbCenters[24]` indexing is unreliable on GLSL1 → define a renderer matrix (WebGL2: a2c + uniform indexing; WebGL1/lite: ordered-dither shell + unrolled/CPU-expanded centers; shader compile/link failure → permanent grid fallback) and add forced-WebGL1 to the resilience matrix.
- **Sort mismatch:** cap cites "owner, then title" but catalog sorts `account`/`title` (`catalog-builder.ts:98`) → use the real account/title order (or introduce+test owner/title explicitly).
- **Overflow disclosure:** silently omitting 25+ apps looks like missing data → show "24 of N shown · Grid View for all" and cover it in the a11y test.
- **Cautions (folded in):** `aria-hidden` the decorative Canvas + toggle announces active view; cache label dims + mutate transforms via refs (no per-frame `getBoundingClientRect`/setState); disable raycast on fire/lightning objects; define a projected-clearance threshold + observation window so "periodically becomes clear" is objective; measure p95 after shader warm-up at fixed viewport/DPR on recorded reference devices; keep ordered-dither coords screen-stable (validate shimmer under motion + bloom).

### Claude's response (final arbiter) → rev 4
Accept all — folded into ORB-REDESIGN-PLAN.md rev 4 verbatim in intent (boolean|null hydration gate; explicit WebGL2/WebGL1 renderer matrix with grid fallback on shader failure; corrected account/title cap wording; visible "N of M shown" overflow chip + a11y coverage; aria-hidden Canvas; ref-based label transforms with cached dims; non-raycasting effects; objective clearance metric; reproducible p95 protocol; screen-stable dither).

## Round 4 — Codex Sol (VERDICT: REVISE)
"Rev 4 resolves all architectural, accessibility, lifecycle, compatibility, and performance-design blockers." Only one verification-precision item + two editorial nits:
- Projected-clearance criterion was a placeholder (no numbers) and used center-to-center, which doesn't prove visual clearance when projected radii differ → define `distance(projected centers) − projRadiusA − projRadiusB`, ≥ 8 px edge-to-edge once within a 30 s window per viewport.
- Editorial: subtitle line still said "Rev 3"; the hidden catalog was called a `<ul>` but `AppGrid` renders a `<div>`.

### Claude's response → rev 4 (final polish)
All three fixed in ORB-REDESIGN-PLAN.md: concrete edge-to-edge clearance metric + acceptance numbers; "Rev 3"→"Rev 4"/"three review rounds"; `<ul>`→"semantic link container (the existing `AppGrid`, a `<div>`)". No behavioral change.

## Round 5 — Codex Sol (VERDICT: APPROVED)
"All prior blockers are resolved, the acceptance criterion is now objectively testable, and the plan is implementation-ready." Converged after 5 rounds. ORB-REDESIGN-PLAN.md rev 4 is the locked, signed-off-pending plan. No code written during either act.

## Act 3 — Build (Codex Sol writes, Claude verifies)
Builder: Codex Sol (`gpt-5.6-sol`), `codex exec --yolo`, thread `019f80cf-da38-7922-a325-9b9ac362f288`. Spec: ORB-REDESIGN-PLAN.md rev 4.

### Round 1 — Codex build report
Implemented the redesign across 4 edits + 6 new modules + 1 test file:
- `orb-nebula.tsx` (rewrite) — instanced pooled single-loop renderer; `nebula-simulation.ts` — boids-lite + Jacobi separation (world+screen) + camera bounds + per-instance scratch; `bubble-shell-material.ts` — instanced depth-writing Fresnel/iridescent shell (WebGL2 alpha-to-coverage / lite ordered-dither) with `aState`; `fire-points.ts` + `lightning-segments.ts` — pooled effects (1152-cap lightning; uniform vs CPU-expanded centers); `label-manager.tsx` — cached-dim, ref-mutated, region-aware labels; `lib/nebula-theme.ts` — derived theme; `apps-experience.tsx` — `useSyncExternalStore` boolean|null reduced-motion + gated Canvas mount + inert catalog + 24-cap + overflow chip + permanent fallback; `page.tsx` — theme plumb; `app/globals.css` — visually-hidden/inert catalog, label + chip + focus styles; `tests/nebula.test.ts`.
- Deviations: (1) Three r180 rejects WebGL1 contexts outright → WebGL1-only clients take the committed permanent Grid View fallback (the shader matrix's WebGL1 branch is unreachable; lite-on-WebGL2 still uses the ordered-dither path). (2) Reference-device p95 not measured (no reference devices available); replaced with deterministic caps + the 1/10/24-orb bounds test and the 30-second ≥8px clearance test.

### Claude's verdict — ACCEPT (no fix round needed)
Verified independently, not from Codex's paste:
- **Proof (ran myself):** `npm run build` ✓ compiles + typechecks; `npm test` ✓ **38 passed / 3 skipped**; `npm run check:bundle` ✓ landing 0 KB / no three.js signature, below 110 KB gzip.
- **Full diff read like a PR:** faithful to rev 4 on every contract — per-instance preallocated scratch (zero per-frame alloc), slug-seeded anchors, snapshot→accumulate→simultaneous Jacobi separation in world **and** screen space, speed-cap + delta-clamp, camera-relative distance/screen bounds, depth-writing shell (correct occlusion without per-instance transparent sort), `aState` dim/hover, 1152-segment preallocated lightning with staggered intensity-only updates, uniform-vs-CPU center split, cached-dim ref-mutated region-aware label manager, `useSyncExternalStore` boolean|null gate, inert crawlable catalog + visible-focus GRID VIEW path, `aria-hidden` Canvas, non-raycasting effects, visibility pause, named context handlers + permanent fallback, one-way full→lite downgrade.
- **Scope:** exactly the 4 intended edits + 7 new files; nothing out of scope touched; both deviations are reasonable (arguably improvements).
- **NOT yet verified:** the actual on-screen *look* of fire vs lightning — that needs eyes on `npm run dev` (inherently manual visual QA, flagged to Scott at the gate).

### Act 3 — Visual QA (Claude, in-browser) — DEFECT FOUND
Served the production build (`next start`) and drove it in Chrome (Claude-in-Chrome). Note: `next dev`/Turbopack couldn't render locally due to a Windows PostCSS-worker spawn failure (`0xc0000142`, environment/process-pressure — unrelated to the code; `next build` is clean), so QA used the production server.
- **Grid + tenant logic: PASS** — Alexander's site shows his apps (First Website, Void Runner = ALEXANDER·LIVE) plus shared apps (Cube3, Dog Age = SHARED·LIVE); semantic catalog renders.
- **Nebula: FAIL to display** — the page falls back to grid with "WEBGL CONTEXT LOST — GRID ACTIVE" **despite a fully WebGL2-capable context**. In-page probes proved it: `webgl2:true` (ANGLE Intel UHD / D3D11), 20 contexts creatable, R3F-attribute context + 16× MSAA + half-float FBO all succeed; and the app's own `supportsWebGL()` returns **true**, `reducedMotion` is **false**. Yet `contextLost` is set true (so `onContextLost` fired from inside `OrbNebula`) and no `<canvas>` remains mounted. Conclusion: an **over-eager fallback** in the new nebula init path (candidates: the `RendererGuard` 120 ms `gl.info.programs[].diagnostics?.runnable` probe — likely dead in three r180 where `diagnostics` was removed; or a JS throw during Canvas/effect-class init caught by R3F, rendering the `fallback` → `onContextLost`). Would hide the nebula for typical Windows-Chrome/ANGLE users.
- **Blocker for commit.** Needs a fix round; the exact throw requires code instrumentation (the browser console tool isn't capturing this server's output).

### Act 3 — Fix Round 1 (Codex writes, Claude verifies) — RESOLVED
Codex (same thread `019f80cf…`) root-caused and fixed the false grid fallback.
- **Root cause:** R3F v9's `<Canvas fallback>` renders its content **unconditionally** (ordinary fallback DOM, not an error-only boundary) — so `CanvasFailure` mounted on every successful render and its `useEffect` called `onContextLost()` every time → grid. Exactly consistent with the QA evidence (WebGL2 fully capable, `supportsWebGL()` true, yet `onContextLost` fired).
- **Fix:** removed `CanvasFailure` + the `fallback` prop, the fragile `gl.info.programs` diagnostics timer, and the backwards `webglcontextrestored`→failure handler. Added `components/apps/nebula-renderer.ts`: `createNebulaRenderer` (the `<Canvas gl={...}>` factory — fallback only if `new THREE.WebGLRenderer` genuinely throws) + `renderer.debug.onShaderError` (fallback only on a real shader compile/link failure) + named `webglcontextlost`→fallback / `webglcontextrestored`→(no fallback) handlers. Added 3 regression tests (success does NOT fall back; constructor failure, shader-link failure, and context loss DO; restore does not).
- **Claude verdict — ACCEPT.** Verified independently: `npm run build` ✓, `npm test` ✓ **41 passed / 3 skipped** (was 38). Reviewed `nebula-renderer.ts` — fallback now triggers only on genuine failure. **Live browser QA on the production build (Chrome, ANGLE Intel UHD / D3D11):** nebula now mounts and is active (`is-nebula`, canvas present) in BOTH auto-lite and `?tier=full` on both tenants — Alexander = translucent blue bubbles with electric veins + bloom; Scott = amber fire color-world bubbles; black labels kept (incl. dormant "IN DEVELOPMENT"); no screenshot cards; no bottom strip; orbs distributed and separated; no console errors. Forced context loss still commits the permanent grid fallback.
- **Aesthetic caveats for Scott's live judgment (not defects):** full-tier fire wisps and outward lightning arcs are animated + hover-concentrated, so static frames understate them; Scott's Fresnel-only fire shell reads as a translucent ring in a still. Taste-level, best judged in motion.
