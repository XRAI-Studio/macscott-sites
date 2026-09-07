# Travel Schooling school portal and game platform — design

_Date: 2026-09-07. Author: Claude (Fable) with Scott. Status: draft for Scott's review._

_Home: this spec lives in the showcase repo for now because that is where it was written.
The portal is a new project; when its repo `XRAI-Studio/travelschooling-portal` is created,
this file moves there and this copy becomes a pointer._

## 1. Goal

Travel Schooling is becoming a school with online classes. Its educational games must sit
behind a school login, each learner must have a saved account whose progress is tracked
across every game, new students must be able to register themselves, and Scott must
approve each registration by hand after confirming the student has connected on social
media.

In scope now, four games:

| Game | Today | Stack |
| --- | --- | --- |
| WordWave | scottmacscott.com on Hostinger, own accounts | Next.js 16, Prisma 7, SQLite |
| Knowledge Horizon | knowledge-horizon.fly.dev, no accounts, typed student name | FastAPI, React/Vite, SQLite on a Fly volume |
| Word Forge | xrai-studio.github.io/Word_Forge/, progress in localStorage | one HTML file, PWA |
| KATAS | xrai-studio.github.io/KATAS/, saves nothing | plain JS modules, three.js |

Out of scope: classes, schedules, assignments, grading (use Google Classroom later), a
teacher UI (Scott is the only teacher and admin), payments, Alexander's games, the
MacScott showcase itself beyond updating four catalog entries.

## 2. Shape

One **portal** owns identity, approval, and the cross-game progress dashboard. Games are
independent deployables on their own subdomains that trust the portal's session and save
progress through a small shared **game kit**.

```
travelschooling.com            Hostinger marketing site (unchanged)
app.travelschooling.com        portal: signup, approval queue, dashboard, launcher  (Vercel)
wordwave.travelschooling.com   WordWave                                          (Vercel)
horizon.travelschooling.com    Knowledge Horizon                                 (Fly)
wordforge.travelschooling.com  Word Forge                                        (Vercel, static)
katas.travelschooling.com      KATAS                                             (Vercel, static)
```

Why subdomains and not one app: the four games are four stacks; folding them together
means rewriting three for no learner-visible gain. A session cookie on `.travelschooling.com`
is readable by every subdomain, so single sign-on costs nothing. Each game can deploy,
break, and be replaced alone.

Why Vercel for the static games instead of Cloudflare Pages (the earlier idea): the only
reason to move DNS to Cloudflare was Cloudflare Access, which self-registration rules out.
Keeping the static games on Vercel means one host for everything except Knowledge Horizon,
one middleware pattern for the login check, and DNS stays at Hostinger. The Cloudflare
steps in Knowledge Horizon's `docs/deploy.md` (sections 5 to 7) are retired by this spec.

### Vendors and plans

| Vendor | Role | Plan | Note |
| --- | --- | --- | --- |
| Vercel | portal, WordWave, Word Forge, KATAS | **Pro, 20 USD/month** | Hobby forbids commercial use; a school selling classes is commercial |
| Supabase | auth + Postgres (school DB, WordWave DB, game progress) | Free to start; Pro 25 USD/month when past 500 MB or 50k monthly users | Provisioned through the Vercel Marketplace (native integration), which injects env vars |
| Resend (or another `messaging` Marketplace provider) | confirmation, reset, and approval emails | Free tier (thousands/month) | **Required, not optional.** Supabase's built-in sender is rate-limited to a handful of emails per hour, which would throttle a class signing up in one evening |
| Fly.io | Knowledge Horizon | usage, a few USD/month with scale-to-zero | Anthropic API spend is the real variable cost; add a per-student daily cap |
| Hostinger | marketing site + DNS | existing | WordWave's Node app slot is freed after cutover |
| GitHub Pages | nothing after cutover | free | Old game URLs redirect (see §9) |

## 3. Accounts

### 3.1 Roles

`student` and `admin`. The value `teacher` is reserved in the enum but has no UI. Scott is
the only admin, set by hand in the database.

Parents do not get accounts. A parent sees a child's progress by signing in with the
child's credentials; the student sees exactly the same dashboard. This is Scott's decision
and keeps the model to one account type.

### 3.2 Signup flow

1. **Age gate first.** Date of birth is the first field.
2. **Under 13:** the form switches to the parent path. The account email is the
   **parent's** email; the form states this plainly. A required checkbox records
   parental consent, and the profile stores `consent_given_by` (parent name),
   `consent_at`, and `is_minor = true`. The student's own email is never collected. This is
   the COPPA-conforming shape: the parent is the verifiable account holder. It does not
   change the architecture, only the form and the profile row.
3. **13 and over:** the student's own email.
4. Fields: display name (first name is enough), date of birth, email, password, and
   **social handles** (at least one of Instagram, YouTube, TikTok, Facebook, X) so Scott can
   check the follow before approving. Handles are free text, validated only for length.
5. Supabase sends the confirmation email through Resend. Until the link is clicked the
   account cannot sign in.
6. After confirmation the student can sign in but lands on a **"waiting for approval"**
   page that repeats the social-media ask with links to the school's profiles. No game is
   reachable. Their profile row has `approved_at = null`.

### 3.3 Approval

An admin page at `app.travelschooling.com/admin/approvals` lists pending profiles:
name, age band (minor or not), email, social handles as clickable links, signup time.
Approve or reject with an optional note. Approval sets `approved_at`, and sends a
"you're in" email through Resend with the launcher link. Rejection keeps the row with
`rejected_at` so a re-signup with the same email is visible as such. Scott can also revoke
an approved account later (sets `approved_at` back to null), which locks every game on the
next request.

Sign-in of an unapproved account is allowed only so the waiting page can show. Nothing
else is.

### 3.4 Sessions across subdomains

This is the correctness spine of the design and is specified precisely:

- Supabase JS is configured with **cookie** storage via `@supabase/ssr`, not localStorage
  (which is per-origin and would break single sign-on). Cookie `Domain=.travelschooling.com`,
  `Secure`, `SameSite=Lax`. It is **not** HttpOnly: the Supabase browser client and the game
  kit read it in the browser. That is the standard Supabase SSR arrangement; the protection
  against token theft is `Secure` plus the one-hour lifetime, and enforcement is always
  server-side in middleware, never in the kit.
- **Only the portal refreshes tokens.** Games never call refresh. Several apps refreshing
  one session concurrently trips Supabase's refresh-token reuse detection and logs the
  learner out everywhere. A game that sees an expired token redirects to
  `app.travelschooling.com/login?next=<game url>`; the portal refreshes silently and
  bounces back.
- Access token lifetime: 1 hour. Refresh token lifetime: 30 days (Supabase default) so a
  student's laptop stays signed in between classes.
- Supabase project uses **asymmetric JWT signing keys** and publishes a JWKS endpoint.
  Every game verifies tokens with the public key only. No app except the portal holds a
  Supabase secret.
- A Supabase **custom access token hook** adds claims `role`, `approved` (boolean) and
  `display_name` to every token. Games therefore enforce approval from the token alone
  with no database round-trip. Revocation takes effect at the next token refresh, at most
  one hour later; the admin page says so.

### 3.5 Login enforcement per host

"Behind a login" means every request for a game page, not only progress writes.

- **Portal and WordWave (Next.js on Vercel):** `proxy.ts` (Next 16's middleware) verifies
  the cookie's JWT against the JWKS and checks `approved`. Unauthenticated → redirect to
  login. Unapproved → redirect to the waiting page. Public paths: login, signup, confirm,
  waiting, static assets.
- **Word Forge and KATAS (static on Vercel):** the same check in a framework-agnostic
  Vercel Routing Middleware file at the project root. Assets are not public; without a valid
  approved token the middleware returns the redirect for every path.
- **Knowledge Horizon (FastAPI on Fly):** a dependency on every route (including the
  WebSocket handshake) that verifies the JWT from the cookie against the JWKS and checks
  `approved`. The static frontend is served by FastAPI, so it is covered by the same
  dependency. This also closes the open `knowledge-horizon.fly.dev` URL: it rejects with a
  redirect to the portal like everything else.

Verification libraries: `jose` in Node and middleware, `PyJWT` with `PyJWKClient` in Python.
JWKS responses are cached for an hour in each process.

## 4. Data

All in the one Supabase Postgres. Row Level Security is on for every table; the portal uses
the service role only in server code for admin actions.

```sql
-- Owned by Supabase: auth.users (email, password hash, confirmation state)

create table profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  display_name     text not null,
  role             text not null default 'student' check (role in ('student','teacher','admin')),
  date_of_birth    date not null,
  is_minor         boolean not null,
  consent_given_by text,            -- parent name, minors only
  consent_at       timestamptz,     -- minors only
  social_handles   jsonb not null default '{}',   -- {"instagram":"...", "youtube":"..."}
  approved_at      timestamptz,
  rejected_at      timestamptz,
  admin_note       text,
  created_at       timestamptz not null default now()
);

create table games (
  slug         text primary key,      -- 'wordwave','horizon','wordforge','katas'
  title        text not null,
  url          text not null,
  sort_order   int  not null
);

-- One row per learner per game. The game owns the shape of `state`; the portal only reads
-- `summary` for the dashboard. This keeps the portal ignorant of game internals.
create table game_progress (
  user_id      uuid references auth.users on delete cascade,
  game         text references games,
  state        jsonb not null default '{}',       -- game's private save data
  summary      jsonb not null default '{}',       -- {"headline":"12 words forged", "percent":34}
  updated_at   timestamptz not null default now(),
  primary key (user_id, game)
);

create table progress_events (                      -- append-only, for the dashboard timeline
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users on delete cascade,
  game         text references games,
  kind         text not null,                       -- 'session','unlock','level', game-defined
  detail       jsonb not null default '{}',
  at           timestamptz not null default now()
);
```

RLS: a user can read and write their own `game_progress` and `progress_events` rows and
read their own profile. Admin (by role claim) can read all profiles and progress and update
approval columns. Nobody else can read anything.

WordWave's own tables (courses, lessons, word reviews, XP) move into the same database
under a `wordwave` schema, owned by Prisma, so its rich progress stays in its own model
and it only mirrors a `summary` into `game_progress` after each lesson.

Knowledge Horizon keeps its SQLite on Fly for session state but writes a `summary` and
`progress_events` to Supabase over HTTPS using the learner's token. Moving its data fully is
a later option, not required.

## 5. The game kit

One file, `ts-kit.js`, about 150 lines, published as a static asset from the portal at
`app.travelschooling.com/kit/v1/ts-kit.js` (versioned path; games pin a version). Plain
JavaScript, no build step required, so the HTML-file game can use it.

```js
const kit = await TSKit.init({ game: 'wordforge' });
kit.user            // { id, displayName, role }  from the verified token; null → kit already redirected to login
await kit.load()    // → state object (the game's own shape) or {}
await kit.save(state, { headline: '12 words forged', percent: 34 })   // debounced, last-write-wins
await kit.event('unlock', { story: 'aqua' })
kit.launcherUrl     // link back to the portal
```

Behaviour:

- `init` reads the session cookie, decodes the token (verification is the middleware's job;
  the kit only reads claims for display), and redirects to the portal login if missing or
  expired.
- `load` and `save` call Supabase REST directly with the user's token; RLS does the
  authorisation. No custom API server exists for progress.
- `save` keeps a copy in localStorage keyed by user id as an offline cache and replays the
  last unsaved state on the next `init`. Word Forge keeps working offline as a PWA.
- Conflict policy is last-write-wins per game. Games are single-player; this is enough.

## 6. Per-app adoption

### 6.1 Portal (new, `XRAI-Studio/travelschooling-portal`)

Next.js 16 App Router on Vercel Pro. Pages: `/signup`, `/confirm`, `/login`, `/waiting`,
`/` (launcher: the four game tiles with each learner's `summary`), `/progress` (dashboard:
per-game summary plus `progress_events` timeline), `/admin/approvals`, `/kit/v1/ts-kit.js`.
Provision Supabase and Resend through the Vercel Marketplace (`vercel integration add
supabase`, then the `messaging` discover result), never by hand-wiring SDK keys.

### 6.2 WordWave (software change, the only one)

- Database: SQLite → Supabase Postgres, `wordwave` schema. Prisma datasource switches to
  `postgresql`; migrations regenerated. `resolveDbPath`, the backup script, the cron item
  and DEPLOY.md's Hostinger sections are deleted. Supabase's backups replace them.
- Identity: `User` rows become keyed by Supabase `user_id`. The login, register, guest and
  Google routes and the password-change page are removed; `proxy.ts` does the login check
  and the app upserts its `User` from the token on first request. Google sign-in, if kept,
  is a Supabase provider configured in the portal, with the new redirect URI added in
  Google Cloud Console before cutover.
- Existing accounts: password hashes do not transfer. Existing users re-register at the
  portal; on their first WordWave request the app links the new `user_id` to the old
  `User` row **by matching email**, so XP, streaks and review schedules carry over. Guest
  accounts are dropped.
- Hosting: deploy to Vercel; the Hostinger instance stays up until the Vercel one is
  verified end to end, then scottmacscott.com redirects to wordwave.travelschooling.com.

### 6.3 Knowledge Horizon

- Add the JWT dependency (§3.5). The typed `student_name` is replaced by the token's
  `display_name`; `user_id` fields carry the Supabase id.
- **Per-user scoping audit:** the app was built for one real student. Every persistence
  read and write (sessions, mastery model, chat threads, comments) is checked so that a
  second learner cannot see or mutate the first learner's rows. This is a required task,
  not an assumption.
- Write `summary` and `progress_events` to Supabase after each session.
- Retire deploy.md sections 5 to 7 (Cloudflare) and add: `flyctl certs add
  horizon.travelschooling.com`, Hostinger CNAME `horizon` → `knowledge-horizon.fly.dev`.

### 6.4 Word Forge

- Replace the two localStorage calls at the `PROGRESS_KEY` site with `kit.load` / `kit.save`.
  `state` = `{ storiesUnlocked, correctTotal }`, `summary` = words forged and stories
  unlocked. Events: `unlock` per story.
- Deploy as a static Vercel project (repo root, no build) with the middleware file. Keep
  the service worker; its relative paths work at a domain root. Change the cache name so
  installed users pick up the new origin cleanly.

### 6.5 KATAS (progress definition is **proposed**, confirm at review)

- Proposed `state`: per kata, furthest step reached and last camera preset; `summary`:
  katas started and completed. Events: `complete` per kata.
- Deploy as a static Vercel project from the existing build output with the middleware
  file. The GitHub Pages workflow is retired.

## 7. Showcase catalog

All four games become login-gated, and a gated app cannot run inside the orb's iframe
(partitioned cookies mean the iframe never sees the session). Each manifest gets its new
`liveUrl` and `embeddable: false`, so the orb shows "external launch" like WordWave does
today. Knowledge Horizon gets a manifest and the `macscott-app` topic if Scott wants it
listed. One `POST /api/revalidate` refreshes both sites.

## 8. DNS (Hostinger, unchanged nameservers)

| Record | Type | Target |
| --- | --- | --- |
| app, wordwave, wordforge, katas | CNAME | `cname.vercel-dns.com` |
| horizon | CNAME | `knowledge-horizon.fly.dev` |

Vercel and Fly issue certificates automatically once the records resolve.

## 9. Migration order

Each step leaves everything before it working.

1. Portal: Supabase + Resend provisioned, signup → confirm → waiting → approve → launcher
   working with zero games. Scott creates his admin row and approves a test student.
2. Word Forge on wordforge.travelschooling.com with the kit. First proof of the kit, the
   middleware, and cross-subdomain sessions. GitHub Pages stays until verified.
3. KATAS, same pattern.
4. Knowledge Horizon: JWT dependency, scoping audit, progress writes, custom domain.
5. WordWave: database move and identity swap on a branch, deployed to a Vercel preview,
   verified with a re-registered test account whose old progress links by email, then
   cutover and Hostinger shutdown.
6. Showcase manifests and revalidate. Old GitHub Pages sites replaced by a one-line
   redirect page each. Hostinger Node app deleted. deploy.md files updated.

## 10. Testing

- Portal: unit tests for the age gate and minor path, the approval state machine, and the
  token hook claims; one integration test that signs up, confirms (Resend in test mode),
  approves, and receives a token whose claims read `approved: true`.
- Middleware: table-driven tests for missing, expired, unapproved and valid tokens on each
  host type (Next proxy, static routing middleware, FastAPI dependency).
- Kit: tests for offline cache replay and last-write-wins.
- WordWave: the existing suite plus a migration test that links an old `User` by email.
- Knowledge Horizon: a two-learner test proving isolation for each persistence path found
  in the scoping audit.
- Manual: one under-13 signup with a parent email, end to end, before any real student.

## 11. Risks and open points

- **Email deliverability** is the most common way a school signup dies. Resend requires a
  verified sending domain (`mail.travelschooling.com` records at Hostinger); do this in
  step 1, not later.
- **Revocation lag** up to one hour (token lifetime). Acceptable for a school; noted in the
  admin UI.
- **Knowledge Horizon's scoping audit** may find more single-student assumptions than
  expected. It is sized as its own task for that reason.
- **WordWave email matching** trusts that a re-registering student uses the same email
  they used before. Anyone who does not starts fresh; the admin page can merge by hand if
  it ever matters.
- **KATAS progress definition** is a proposal awaiting Scott's confirmation.
- **The word-weighting sentence game** Scott remembers building was not found on this
  machine, GitHub or Drive. When it turns up it adopts the kit like Word Forge.
