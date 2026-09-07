# Travel Schooling school portal and game platform — design

_Date: 2026-09-07, revision 2 after Scott's first review. Author: Claude (Fable) with Scott.
Status: draft for Scott's second review._

_Home: this spec lives in the showcase repo for now because that is where it was written.
The portal is a new project; when its repo `XRAI-Studio/travelschooling-portal` is created,
this file moves there and this copy becomes a pointer._

_Changes in revision 2: portal moves to `class.travelschooling.com`; Vercel Hobby instead
of Pro; Supabase's built-in email instead of a separate provider, with the over-limit
behaviour specified; a shared rewards system (XP, streaks, gems, achievements) that every
game plugs into, modelled on WordWave's._

## 1. Goal

Travel Schooling is becoming a school with free online classes. Its educational games must
sit behind a school login, each learner must have a saved account whose progress **and
rewards** are tracked across every game, new students must be able to register themselves,
and Scott must approve each registration by hand after confirming the student has
connected on social media. Enrollment is deliberately small and in batches.

In scope now, four games:

| Game | Today | Stack |
| --- | --- | --- |
| WordWave | scottmacscott.com on Hostinger, own accounts and rewards | Next.js 16, Prisma 7, SQLite |
| Knowledge Horizon | knowledge-horizon.fly.dev, no accounts, typed student name | FastAPI, React/Vite, SQLite on a Fly volume |
| Word Forge | xrai-studio.github.io/Word_Forge/, progress in localStorage | one HTML file, PWA |
| KATAS | xrai-studio.github.io/KATAS/, saves nothing | plain JS modules, three.js |

Out of scope: classes, schedules, assignments, grading (use Google Classroom later), a
teacher UI (Scott is the only teacher and admin), payments, Alexander's games, the
MacScott showcase itself beyond updating four catalog entries.

## 2. Shape

One **portal** owns identity, approval, the rewards ledger, and the cross-game progress
dashboard. Games are independent deployables on their own subdomains that trust the
portal's session and save progress and award rewards through a small shared **game kit**.

```
travelschooling.com            Hostinger marketing site (unchanged)
class.travelschooling.com      portal: signup, approval, launcher, dashboard, rewards, shop  (Vercel)
wordwave.travelschooling.com   WordWave                                                    (Vercel)
horizon.travelschooling.com    Knowledge Horizon                                           (Fly)
wordforge.travelschooling.com  Word Forge                                                  (Vercel, static)
katas.travelschooling.com      KATAS                                                       (Vercel, static)
```

Why subdomains and not one app: the four games are four stacks; folding them together
means rewriting three for no learner-visible gain. A session cookie on `.travelschooling.com`
is readable by every subdomain, so single sign-on costs nothing. Each game can deploy,
break, and be replaced alone.

Why Vercel for the static games instead of Cloudflare Pages (the earlier idea): the only
reason to move DNS to Cloudflare was Cloudflare Access, which self-registration rules out.
One host for everything except Knowledge Horizon, one middleware pattern for the login
check, and DNS stays at Hostinger. The Cloudflare steps in Knowledge Horizon's
`docs/deploy.md` (sections 5 to 7) are retired by this spec.

### Vendors and plans

| Vendor | Role | Plan | Note |
| --- | --- | --- | --- |
| Vercel | portal, WordWave, Word Forge, KATAS | **Hobby, free** | Hobby is for non-commercial use; free classes qualify. Scott's upgrade trigger is paid classes or more than 50 students, not expected before 2028. Hobby also limits a personal account to one member, which fits a one-admin school |
| Supabase | auth + Postgres (school DB, rewards, WordWave DB, game progress) | Free | Provisioned through the Vercel Marketplace (native integration), which injects env vars. Pro at 25 USD/month only past 500 MB or 50k monthly users |
| Supabase built-in email | confirmation and password-reset emails | Free | **2 emails per hour, hard limit.** See §3.3 for what happens at five signups in an hour. Approval is not notified by email at all |
| Fly.io | Knowledge Horizon | usage, a few USD/month with scale-to-zero | Anthropic API spend is the real variable cost; add a per-student daily cap |
| Hostinger | marketing site + DNS | existing | WordWave's Node app slot is freed after cutover |
| GitHub Pages | nothing after cutover | free | Old game URLs redirect (see §10) |

## 3. Accounts

### 3.1 Roles

`student` and `admin`. The value `teacher` is reserved in the enum but has no UI. Scott is
the only admin, set by hand in the database.

Parents do not get accounts. A parent sees a child's progress by signing in with the
child's credentials; the student sees exactly the same dashboard. One account type.

### 3.2 Signup flow

1. **Enrollment switch.** Admin can open or close enrollment. Closed shows "enrollment
   opens on <date>" and no form. This is how Scott keeps signups in small batches.
2. **Age gate first.** Date of birth is the first field.
3. **Under 13:** the form switches to the parent path. The account email is the
   **parent's** email; the form states this plainly. A required checkbox records
   parental consent, and the profile stores `consent_given_by` (parent name),
   `consent_at`, and `is_minor = true`. The student's own email is never collected. The
   parent is the verifiable account holder, which is the COPPA-conforming shape.
4. **13 and over:** the student's own email.
5. Fields: display name (first name is enough), date of birth, email, password, and
   **social handles** (at least one of Instagram, YouTube, TikTok, Facebook, X) so Scott can
   check the follow before approving. Free text, validated for length only.
6. Supabase sends the confirmation email. Until the link is clicked the account cannot
   sign in.
7. After confirmation the student can sign in but lands on a **waiting page** that repeats
   the social-media ask with links to the school's profiles and says Scott will reach them
   there. No game is reachable. Profile has `approved_at = null`.

### 3.3 The email limit, exactly

The built-in sender allows **2 emails per hour per project**. Signups three, four and five
in the same hour get a `429` from Supabase and **no account is created** for them.

What the portal does about it:

- The form keeps its values in the browser. On a 429 it shows: "We can only send two
  confirmation emails an hour and both are spoken for. Your details are kept on this
  page; try again after <time>." The time is one hour after the earliest of the two sends
  the portal has seen, which it tracks in a `email_sends` table.
- The waiting page has a **resend confirmation** button, subject to the same limit.
- **No approval email.** Scott tells the student on social media, where they have just
  connected, and the waiting page checks approval every minute and forwards itself to the
  launcher the moment `approved_at` is set. Rejection is likewise not emailed.
- Password reset shares the same two-per-hour budget. The reset page says so.

The enrollment switch (§3.2 step 1) is the real control: open it for a handful of students
at a time and the limit is never hit. If it ever becomes a nuisance, switching Supabase to a
custom SMTP provider is a dashboard change and takes an hour; nothing in the code moves.

### 3.4 Approval

`class.travelschooling.com/admin/approvals` lists pending profiles: name, minor or not,
email, social handles as clickable links, signup time. Approve or reject with an optional
note. Approval sets `approved_at`. Rejection keeps the row with `rejected_at` so a
re-signup with the same email is visible. Scott can revoke an approved account later
(sets `approved_at` back to null), which locks every game on the next token refresh.

### 3.5 Sessions across subdomains

This is the correctness spine of the design and is specified precisely:

- Supabase JS is configured with **cookie** storage via `@supabase/ssr`, not localStorage
  (which is per-origin and would break single sign-on). Cookie `Domain=.travelschooling.com`,
  `Secure`, `SameSite=Lax`. It is **not** HttpOnly: the Supabase browser client and the game
  kit read it in the browser. That is the standard Supabase SSR arrangement; protection
  against token theft is `Secure` plus the one-hour lifetime, and enforcement is always
  server-side in middleware, never in the kit.
- **Only the portal refreshes tokens.** Games never call refresh. Several apps refreshing
  one session concurrently trips Supabase's refresh-token reuse detection and logs the
  learner out everywhere. A game that sees an expired token redirects to
  `class.travelschooling.com/login?next=<game url>`; the portal refreshes silently and
  bounces back.
- Access token lifetime: 1 hour. Refresh token lifetime: 30 days (Supabase default) so a
  student's laptop stays signed in between classes.
- Supabase project uses **asymmetric JWT signing keys** and publishes a JWKS endpoint.
  Every game verifies tokens with the public key only. No app except the portal holds a
  Supabase secret.
- A Supabase **custom access token hook** adds claims `role`, `approved` (boolean) and
  `display_name` to every token. Games enforce approval from the token alone with no
  database round-trip. Revocation takes effect at the next refresh, at most one hour later;
  the admin page says so.

### 3.6 Login enforcement per host

"Behind a login" means every request for a game page, not only progress writes.

- **Portal and WordWave (Next.js on Vercel):** `proxy.ts` (Next 16's middleware) verifies
  the cookie's JWT against the JWKS and checks `approved`. Unauthenticated → login.
  Unapproved → waiting page. Public paths: login, signup, confirm, waiting, static assets.
- **Word Forge and KATAS (static on Vercel):** the same check in a framework-agnostic
  Vercel Routing Middleware file at the project root. Assets are not public; without a valid
  approved token the middleware redirects for every path.
- **Knowledge Horizon (FastAPI on Fly):** a dependency on every route (including the
  WebSocket handshake) that verifies the JWT from the cookie against the JWKS and checks
  `approved`. The static frontend is served by FastAPI, so it is covered too. This closes
  the open `knowledge-horizon.fly.dev` URL: it redirects to the portal like everything else.

Verification libraries: `jose` in Node and middleware, `PyJWT` with `PyJWKClient` in Python.
JWKS responses are cached for an hour in each process.

## 4. Rewards

Every game gets XP, streaks, gems, achievements and a shop **without building any of it**.
The portal owns one rewards system for the whole school, modelled on WordWave's, and games
call it through the kit. A learner has one XP total, one streak and one gem balance across
all games, so playing KATAS on Tuesday keeps the streak WordWave started on Monday.

### 4.1 Rules

- **XP** is awarded by games per meaningful action (a lesson, a kata completed, a word
  forged). Each game declares its XP events and their values in a config row, and the
  server caps XP per event and per learner per game per day, so a client cannot invent
  points. Levels are a pure function of total XP (same curve as WordWave's).
- **Streak** counts consecutive days with at least one XP-earning action in any game,
  computed on the server in the learner's timezone (stored on the profile). **Streak
  freezes** are consumed automatically on a missed day if the learner owns one.
- **Gems** are earned at level-ups and on achievements, and spent in the portal's **shop**
  (streak freezes, cosmetic avatar frames; the catalogue is a table, not code).
- **Achievements** are defined per game or school-wide in a table (id, title, description,
  icon, game or null, gem reward). A game unlocks one by name; the portal awards the gems.
- **Quests** (WordWave's daily "earn 30 XP" style) are school-wide dailies defined in a
  table and evaluated on the server from the ledger. No game code involved.

### 4.2 Why one ledger and not per-game

Each game keeping its own XP would give a learner four streaks and four gem balances, and
parents four dashboards to read. One ledger makes the launcher's "your week" honest, makes
new games rewarding on day one, and puts every anti-cheat rule in one place.

## 5. Data

All in the one Supabase Postgres. Row Level Security is on for every table; the portal
uses the service role only in server code for admin actions.

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
  timezone         text not null default 'America/New_York',
  approved_at      timestamptz,
  rejected_at      timestamptz,
  admin_note       text,
  created_at       timestamptz not null default now()
);

create table settings (            -- single row
  enrollment_open  boolean not null default false,
  enrollment_note  text
);

create table email_sends (         -- for the two-per-hour bookkeeping in §3.3
  sent_at timestamptz not null default now(), kind text not null
);

create table games (
  slug         text primary key,      -- 'wordwave','horizon','wordforge','katas'
  title        text not null,
  url          text not null,
  sort_order   int  not null,
  xp_events    jsonb not null default '{}',   -- {"lesson": {"xp": 10, "per_day": 20}, ...}
  daily_xp_cap int  not null default 200
);

-- One row per learner per game. The game owns the shape of `state`; the portal reads only
-- `summary` for the dashboard, so it stays ignorant of game internals.
create table game_progress (
  user_id      uuid references auth.users on delete cascade,
  game         text references games,
  state        jsonb not null default '{}',
  summary      jsonb not null default '{}',   -- {"headline":"12 words forged","percent":34}
  updated_at   timestamptz not null default now(),
  primary key (user_id, game)
);

-- Append-only ledger. Every XP or gem movement is a row; totals are derived.
create table reward_ledger (
  id        bigint generated always as identity primary key,
  user_id   uuid references auth.users on delete cascade,
  game      text references games,          -- null for school-wide (quests, shop)
  kind      text not null,                  -- 'xp','gems'
  event     text not null,                  -- 'lesson','kata_complete','level_up','shop:freeze',...
  amount    int  not null,                  -- negative for spends
  detail    jsonb not null default '{}',
  at        timestamptz not null default now()
);

create table reward_totals (                -- maintained by the award() function
  user_id        uuid primary key references auth.users on delete cascade,
  xp             int  not null default 0,
  level          int  not null default 1,
  gems           int  not null default 0,
  streak         int  not null default 0,
  streak_freezes int  not null default 0,
  last_active    date
);

create table achievements (
  id          text primary key, game text references games, title text not null,
  description text not null, icon text not null, gems int not null default 0
);
create table user_achievements (
  user_id uuid references auth.users on delete cascade, achievement text references achievements,
  at timestamptz not null default now(), primary key (user_id, achievement)
);

create table quests (                       -- school-wide dailies
  id text primary key, title text not null, rule jsonb not null, gems int not null
);
create table shop_items (
  id text primary key, title text not null, price int not null, effect jsonb not null
);
```

**Server functions (Postgres, `security definer`):** `award(game, event, detail)` validates
the event against `games.xp_events`, applies the daily cap, inserts the ledger row, updates
`reward_totals`, recomputes streak and level, awards level-up gems, and evaluates quests.
`unlock(achievement)` and `buy(item)` follow the same pattern. Clients never write
`reward_totals` or the ledger directly; RLS forbids it. This is how a school with a tiny
budget gets server-authoritative rewards with no server of its own.

RLS: a learner reads and writes their own `game_progress`, reads their own totals, ledger
and achievements, and calls the functions. Admin (by role claim) reads all profiles,
progress and totals and updates approval columns and `settings`.

WordWave's own tables (courses, lessons, word reviews) move into the same database under a
`wordwave` schema, owned by Prisma. Its XP, streak, gems, freezes, quests, achievements and
shop are **replaced** by the school-wide ones (§7.2), not mirrored.

Knowledge Horizon keeps its SQLite on Fly for tutoring state but writes `summary` and calls
`award` over HTTPS using the learner's token. Moving its data fully is a later option.

## 6. The game kit

One file, `ts-kit.js`, about 200 lines, published as a static asset from the portal at
`class.travelschooling.com/kit/v1/ts-kit.js` (versioned path; games pin a version). Plain
JavaScript, no build step, so the HTML-file game can use it.

```js
const kit = await TSKit.init({ game: 'wordforge' });
kit.user                 // { id, displayName, role }; null → kit already redirected to login
await kit.load()         // → state object (the game's own shape) or {}
await kit.save(state, { headline: '12 words forged', percent: 34 })  // debounced, last-write-wins
await kit.award('word_forged', { word: 'aqueduct' })   // → { xp, gems, level, streak, levelUp, newAchievements }
await kit.unlock('first_story')
kit.totals               // latest { xp, level, gems, streak } for an in-game HUD
kit.launcherUrl          // link back to the portal
```

Behaviour:

- `init` reads the session cookie, decodes the token (verification is the middleware's job;
  the kit only reads claims for display), redirects to the portal login if missing or
  expired, and fetches `reward_totals` once.
- `load`, `save`, `award`, `unlock` call Supabase REST and RPC directly with the learner's
  token; RLS and the server functions do the authorisation. No custom API server exists.
- `save` keeps a copy in localStorage keyed by user id as an offline cache and replays the
  last unsaved state on the next `init`. Awards made offline are queued and replayed too,
  subject to the same server caps. Word Forge keeps working offline as a PWA.
- Conflict policy is last-write-wins per game. Games are single-player; this is enough.
- `award` returns what changed so a game can show "+10 XP", a level-up, or a new
  achievement in its own style. A tiny optional `kit.toast()` renders a default one.

## 7. Per-app adoption

### 7.1 Portal (new, `XRAI-Studio/travelschooling-portal`)

Next.js 16 App Router on Vercel Hobby. Pages: `/signup`, `/confirm`, `/login`, `/waiting`,
`/` (launcher: the four game tiles with each learner's `summary`, plus XP, level, streak
and gems), `/progress` (per-game summary and the ledger as a timeline), `/achievements`,
`/shop`, `/admin/approvals`, `/admin/settings` (enrollment switch), `/kit/v1/ts-kit.js`.
Provision Supabase through the Vercel Marketplace (`vercel integration add supabase`), never
by hand-wiring keys.

### 7.2 WordWave (software change, the only one)

- Database: SQLite → Supabase Postgres, `wordwave` schema. Prisma datasource switches to
  `postgresql`; migrations regenerated. `resolveDbPath`, the backup script, the cron item
  and DEPLOY.md's Hostinger sections are deleted. Supabase's backups replace them.
- Identity: `User` rows become keyed by Supabase `user_id`. The login, register, guest and
  Google routes and the password-change page are removed; `proxy.ts` does the login check
  and the app upserts its `User` from the token on first request.
- Rewards: WordWave's `xp`, `streakCount`, `gems`, `streakFreezes`, `QuestProgress`,
  `Achievement` and shop are replaced by the school ledger. Its lesson-complete and review
  paths call `award` server-side (with the learner's token, not the service role). Its
  existing XP events and values become the `wordwave` row in `games.xp_events`, and its
  achievement list seeds `achievements` with `game = 'wordwave'`. **Existing balances are
  migrated once**: a script inserts an opening ledger row per learner so nobody loses XP or
  gems.
- Existing accounts: password hashes do not transfer. Existing users re-register at the
  portal; on their first WordWave request the app links the new `user_id` to the old
  `User` row **by matching email**, carrying over course progress, review schedules and the
  migrated balances. Guest accounts are dropped.
- Hosting: deploy to Vercel; the Hostinger instance stays up until the Vercel one is
  verified end to end, then scottmacscott.com redirects to wordwave.travelschooling.com.

### 7.3 Knowledge Horizon

- Add the JWT dependency (§3.6). The typed `student_name` is replaced by the token's
  `display_name`; `user_id` fields carry the Supabase id.
- **Per-user scoping audit:** the app was built for one real student. Every persistence
  read and write (sessions, mastery model, chat threads, comments) is checked so that a
  second learner cannot see or mutate the first learner's rows. A required task, not an
  assumption.
- Rewards: `award('problem_correct')` per correct answer, `award('session_complete')` per
  session, achievements for first mastery of a standard. Summary: standards mastered.
- Retire deploy.md sections 5 to 7 (Cloudflare) and add: `flyctl certs add
  horizon.travelschooling.com`, Hostinger CNAME `horizon` → `knowledge-horizon.fly.dev`.

### 7.4 Word Forge

- Replace the two localStorage calls at the `PROGRESS_KEY` site with `kit.load` / `kit.save`.
  `state` = `{ storiesUnlocked, correctTotal }`; summary: words forged and stories unlocked.
- Rewards: `award('word_forged')` per correct forge, `award('story_unlocked')`, achievements
  at 50, 200 and 500 words and for every story unlocked. Its in-game score and streak stay as
  per-round flavour; the school ledger is the durable one.
- Deploy as a static Vercel project (repo root, no build) with the middleware file. Keep
  the service worker; its relative paths work at a domain root. Change the cache name so
  installed users pick up the new origin cleanly.

### 7.5 KATAS (progress definition is **proposed**, confirm at review)

- Proposed `state`: per kata, furthest step reached and last camera preset; summary: katas
  started and completed.
- Rewards: `award('kata_step')` per new furthest step, `award('kata_complete')` the first
  time a kata is stepped through end to end, an achievement per kata and one for all five.
- Deploy as a static Vercel project from the existing build output with the middleware
  file. The GitHub Pages workflow is retired.

## 8. Showcase catalog

All four games become login-gated, and a gated app cannot run inside the orb's iframe
(partitioned cookies mean the iframe never sees the session). Each manifest gets its new
`liveUrl` and `embeddable: false`, so the orb shows "external launch" like WordWave does
today. Knowledge Horizon gets a manifest and the `macscott-app` topic if Scott wants it
listed. One `POST /api/revalidate` refreshes both sites.

## 9. DNS (Hostinger, unchanged nameservers)

| Record | Type | Target |
| --- | --- | --- |
| class, wordwave, wordforge, katas | CNAME | `cname.vercel-dns.com` |
| horizon | CNAME | `knowledge-horizon.fly.dev` |

Vercel and Fly issue certificates automatically once the records resolve.

## 10. Migration order

Each step leaves everything before it working.

1. Portal: Supabase provisioned; signup → confirm → waiting → approve → launcher working
   with zero games; rewards tables, functions, shop and quests in place with a test game
   row. Scott creates his admin row and approves a test student.
2. Word Forge on wordforge.travelschooling.com with the kit. First proof of the kit, the
   middleware, cross-subdomain sessions and `award`. GitHub Pages stays until verified.
3. KATAS, same pattern.
4. Knowledge Horizon: JWT dependency, scoping audit, awards, custom domain.
5. WordWave: database move, identity swap and rewards replacement on a branch, deployed
   to a Vercel preview, verified with a re-registered test account whose old progress and
   balances link by email, then cutover and Hostinger shutdown.
6. Showcase manifests and revalidate. Old GitHub Pages sites replaced by a one-line
   redirect page each. Hostinger Node app deleted. deploy.md files updated.

## 11. Testing

- Portal: unit tests for the age gate and minor path, the approval state machine, the
  enrollment switch, the 429 handling in §3.3, and the token hook claims; one integration
  test that signs up, confirms, approves, and receives a token whose claims read
  `approved: true`.
- Rewards: SQL tests for `award` (unknown event rejected, per-event and daily caps, level
  and gem maths, streak across two games and across a missed day with and without a
  freeze), `unlock` idempotence, and `buy` with insufficient gems.
- Middleware: table-driven tests for missing, expired, unapproved and valid tokens on each
  host type (Next proxy, static routing middleware, FastAPI dependency).
- Kit: tests for offline cache replay, queued awards replay, and last-write-wins.
- WordWave: the existing suite plus a migration test that links an old `User` by email and
  reproduces its balances in the ledger.
- Knowledge Horizon: a two-learner test proving isolation for each persistence path found
  in the scoping audit.
- Manual: one under-13 signup with a parent email, end to end, before any real student.

## 12. Risks and open points

- **Two emails an hour** is the sharpest edge. It is handled (§3.3) and controlled by the
  enrollment switch, and a custom SMTP provider is a one-hour dashboard change if it ever
  bites. Password resets share the budget.
- **Revocation lag** up to one hour (token lifetime). Acceptable for a school; noted in the
  admin UI.
- **Reward caps are guesses** until real play data exists. Values live in table rows, so
  tuning them is an update, not a deploy.
- **Knowledge Horizon's scoping audit** may find more single-student assumptions than
  expected. It is sized as its own task for that reason.
- **WordWave email matching** trusts that a re-registering student uses the same email
  they used before. Anyone who does not starts fresh; the admin page can merge by hand.
- **KATAS progress definition** is a proposal awaiting Scott's confirmation.
- **Vercel Hobby** is free while the school is non-commercial. Charging for classes or
  passing 50 students is Scott's trigger to move to Pro.
- **The word-weighting sentence game** Scott remembers building was not found on this
  machine, GitHub or Drive. When it turns up it adopts the kit like Word Forge.
