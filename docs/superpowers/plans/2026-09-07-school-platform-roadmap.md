# Travel Schooling school platform — plan roadmap

**Spec:** `docs/superpowers/specs/2026-09-07-travelschooling-school-portal-design.md` (approved by Scott 2026-09-07, revision 3).

The spec covers six subsystems. Each gets its own implementation plan that produces
working software on its own, executed in this order because each depends on the one before.
Write each plan (with the `superpowers:writing-plans` skill) when its turn comes, not
before, so it can reflect what the earlier plans actually built.

| # | Plan | Spec sections | Status | Repo |
| --- | --- | --- | --- | --- |
| 1 | Portal: accounts, approval, rewards ledger, game kit, launcher | 3, 4, 5, 6, 7.1 | **written** → `2026-09-07-portal-implementation.md` | new `XRAI-Studio/travelschooling-portal` |
| 2 | Word Forge adoption (first proof of kit + middleware + subdomain) | 7.4, 3.6, 9 | not started | `XRAI-Studio/Word_Forge` |
| 3 | KATAS course: pages, history, quizzes, views, journal, adoption | 7.5, 3.6, 9 | not started; content drafts in KATAS PR #2 | `XRAI-Studio/KATAS` |
| 4 | Knowledge Horizon: JWT dependency, per-user scoping audit, awards, domain | 7.3, 3.6, 9 | not started | `XRAI-Studio/knowledge-horizon` |
| 5 | WordWave: Postgres move, identity swap, rewards replacement, Vercel cutover | 7.2, 3.6, 9 | not started | `XRAI-Studio/Word_Wave` |
| 6 | Showcase catalog manifests, redirects from old URLs, teardown | 8, 10 step 6 | not started | four app repos + `macscott-sites` |

Cross-plan facts every executor needs:

- Session cookie is on `.travelschooling.com`; only the portal refreshes tokens (spec §3.5).
- Games verify tokens against the JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`
  and read the claims `approved`, `role`, `display_name` (spec §3.5, Plan 1 Task 4 and 5).
- The kit is served from `https://class.travelschooling.com/kit/v1/ts-kit.js` (Plan 1 Task 12).
- Rewards go through the Postgres functions `award`, `unlock`, `buy` (Plan 1 Task 10).
