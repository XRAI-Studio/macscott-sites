# Travel Schooling Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `class.travelschooling.com`: self-registration with age gate and email confirmation, Scott's approval queue, a school-wide rewards ledger, a game launcher and dashboard, and the `ts-kit.js` file games use to read the session, save progress and award rewards.

**Architecture:** Next.js 16 App Router on Vercel Hobby with Supabase (auth + Postgres) provisioned through the Vercel Marketplace. Identity and approval live in Supabase auth plus a `profiles` table; a custom access token hook stamps `approved`, `role` and `display_name` into every JWT so games verify against the JWKS with no database call. Rewards are Postgres functions (`award`, `unlock`, `buy`) behind Row Level Security; the portal and games call them with the learner's own token.

**Tech Stack:** Next.js 16.2 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, `@supabase/supabase-js` + `@supabase/ssr`, `jose`, `zod` 4, Vitest, Supabase CLI (`npx supabase`) for migrations.

**Spec:** `docs/superpowers/specs/2026-09-07-travelschooling-school-portal-design.md` (in `XRAI-Studio/macscott-sites`; copy it into the portal repo's `docs/superpowers/specs/` in Task 1).

## Global Constraints

- Portal host is `class.travelschooling.com`; session cookie `Domain=.travelschooling.com`, `Secure`, `SameSite=Lax`, **not** HttpOnly (spec §3.5).
- Only the portal refreshes Supabase sessions. Nothing in this plan exposes refresh to games.
- Access token lifetime 1 hour; refresh token 30 days (Supabase dashboard defaults, confirm in Task 0).
- Supabase project uses asymmetric JWT signing keys; verification is by JWKS only. The service role key is used only in server code under `app/api/admin/**` and `lib/supabase/admin.ts`.
- Roles: `student`, `admin`; `teacher` exists in the enum, no UI.
- Under 13: account email is the parent's; `is_minor`, `consent_given_by`, `consent_at` recorded; student email never collected (spec §3.2).
- Built-in Supabase email only, 2 per hour. Signup and reset handle `429` as spec §3.3. No approval email.
- Vercel **Hobby**, provisioning via `vercel integration add supabase`. Never hand-wire provider keys.
- Node 20.9+ locally (same floor as `macscott-sites`). All new files LF; the repos are Windows checkouts, so keep `.gitattributes` with `* text=auto eol=lf`.
- Tests: `npm test` = Vitest unit tests, always green offline. `npm run test:integration` = tests that need a live Supabase project, gated on `RUN_INTEGRATION=1`, skipped otherwise.
- Commit after every task with a message that says why, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

```
travelschooling-portal/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts, .gitattributes, .env.example
  proxy.ts                           login/approval gate for every request (Task 5)
  lib/auth/claims.ts                 Claims type + pure route decision (Task 5)
  lib/auth/jwt.ts                    verifyAccessToken via JWKS (Task 4)
  lib/auth/cookies.ts                cookie options + name (Task 3)
  lib/supabase/server.ts             createServerClient for RSC/route handlers (Task 3)
  lib/supabase/browser.ts            createBrowserClient (Task 3)
  lib/supabase/admin.ts              service-role client, server only (Task 3)
  lib/signup.ts                      zod schema, age gate, minor path (Task 6)
  lib/email-limit.ts                 two-per-hour bookkeeping maths (Task 6)
  app/api/signup/route.ts            POST: validates, signs up, records send, 429 handling (Task 7)
  app/api/me/route.ts                GET: approval state for the waiting page (Task 8)
  app/api/admin/approvals/route.ts   GET pending, POST approve/reject/revoke (Task 9)
  app/api/admin/settings/route.ts    GET/POST enrollment switch (Task 9)
  app/api/shop/route.ts              POST buy (Task 11)
  app/(public)/{signup,confirm,login,waiting}/page.tsx      (Task 8)
  app/(app)/{page,progress,achievements,shop}/page.tsx      (Task 11)
  app/admin/{approvals,settings}/page.tsx                   (Task 9)
  public/kit/v1/ts-kit.js            the game kit, plain JS (Task 12)
  supabase/migrations/0001_accounts.sql   profiles, settings, email_sends, games, trigger, RLS (Task 2)
  supabase/migrations/0002_token_hook.sql custom access token hook (Task 3)
  supabase/migrations/0003_rewards.sql    ledger, totals, achievements, quests, shop, journal, functions (Task 10)
  supabase/seed.sql                  games, achievements, shop items, quests (Task 14)
  tests/*.test.ts                    unit; tests/*.integration.test.ts need RUN_INTEGRATION=1
```

---

### Task 0: Accounts and provisioning (Scott, with the executor watching)

**Files:** none in the repo yet.

**Interfaces:**
- Produces: a linked Vercel project `travelschooling-portal` with Supabase env vars, a Supabase project with asymmetric JWT keys and the hook setting reachable, and `.env.local` pulled.

- [ ] **Step 1: Install the Vercel CLI and log in.** It is not installed on this machine.

```bash
npm i -g vercel
vercel login
```

STOP and ask Scott to complete the browser login.

- [ ] **Step 2: Create the repo and link the Vercel project.**

```bash
gh repo create XRAI-Studio/travelschooling-portal --private --clone
cd travelschooling-portal
git commit --allow-empty -m "Start the Travel Schooling portal"
git push -u origin main
vercel link --yes        # creates project travelschooling-portal on Scott's Hobby account
```

- [ ] **Step 3: Provision Supabase through the Marketplace.**

```bash
vercel integration add supabase --yes --no-claim
vercel env ls
```

Expected: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL` (names may include a few more; note the exact names in `.env.example`). If the CLI hands off to the dashboard, run `vercel integration open supabase` and STOP for Scott.

- [ ] **Step 4: Pull env and confirm access.**

```bash
vercel env pull .env.local --yes
grep -c SUPABASE .env.local
```

Expected: at least 3.

- [ ] **Step 5: Supabase dashboard settings (Scott, one time).** Project → Authentication:
  - **JWT Keys:** create a new asymmetric (ES256) signing key and rotate to it; confirm `https://<project>.supabase.co/auth/v1/.well-known/jwks.json` returns a key.
  - **Sessions:** access token expiry `3600` seconds; refresh token reuse detection on (default).
  - **Sign In / Providers → Email:** confirm email ON; secure email change ON.
  - **URL Configuration:** Site URL `https://class.travelschooling.com`; redirect URLs add `https://class.travelschooling.com/confirm` and `http://localhost:3000/confirm`.
  - Leave the built-in SMTP; do not enable custom SMTP (spec §3.3).

STOP until Scott confirms all five.

- [ ] **Step 6: Link the Supabase CLI for migrations.**

```bash
npx supabase@latest login
npx supabase link --project-ref <ref from NEXT_PUBLIC_SUPABASE_URL>
```

Expected: "Finished supabase link."

---

### Task 1: Scaffold the Next.js app with tests and copy the spec in

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitattributes`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `postcss.config.mjs`, `tests/smoke.test.ts`, `docs/superpowers/specs/2026-09-07-travelschooling-school-portal-design.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test`, `npm run test:integration`, `npm run dev`, `npm run build` all work.

- [ ] **Step 1: Scaffold.**

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
npm i @supabase/supabase-js @supabase/ssr jose zod
npm i -D vitest cross-env @types/node
```

- [ ] **Step 2: Write `vitest.config.ts`** (mirrors `macscott-sites`).

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    clearMocks: true,
  },
});
```

- [ ] **Step 3: Scripts in `package.json`.**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --exclude tests/**/*.integration.test.ts",
  "test:integration": "cross-env RUN_INTEGRATION=1 vitest run tests/**/*.integration.test.ts --testTimeout=60000",
  "db:push": "supabase db push",
  "db:seed": "supabase db query --file supabase/seed.sql"
}
```

- [ ] **Step 4: `.gitattributes`, `.env.example`, and the integration gate helper.**

`.gitattributes`:
```
* text=auto eol=lf
```

`.env.example` (values blank; names from `vercel env ls`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_COOKIE_DOMAIN=            # .travelschooling.com in production; leave empty locally
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`tests/helpers/integration.ts`:
```ts
export const integration = process.env.RUN_INTEGRATION === "1";
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for integration tests (vercel env pull .env.local)`);
  return v;
}
```

- [ ] **Step 5: Smoke test.** `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
describe("toolchain", () => {
  it("runs", () => expect(1 + 1).toBe(2));
});
```

Run: `npm test` → PASS. Run: `npm run build` → completes.

- [ ] **Step 6: Copy the spec** from `macscott-sites/docs/superpowers/specs/2026-09-07-travelschooling-school-portal-design.md` to the same path here, and replace the copy in `macscott-sites` with a one-line pointer to this repo.

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "Scaffold the portal with Next 16, Supabase clients and Vitest"
```

---

### Task 2: Accounts schema migration

**Files:**
- Create: `supabase/migrations/0001_accounts.sql`, `tests/accounts-schema.integration.test.ts`

**Interfaces:**
- Produces: tables `profiles`, `settings`, `email_sends`, `games`; trigger `handle_new_user` that creates a profile from `raw_user_meta_data`; RLS policies. Column names exactly as in spec §5.

- [ ] **Step 1: Write the failing integration test.**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { integration, requireEnv } from "./helpers/integration";

describe.skipIf(!integration)("accounts schema", () => {
  const admin = () => createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const email = `test-${Date.now()}@example.com`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin().auth.admin.createUser({
      email, password: "Passw0rd!Passw0rd!", email_confirm: true,
      user_metadata: { display_name: "Testy", date_of_birth: "2015-06-01", is_minor: true, consent_given_by: "Parent", social_handles: { instagram: "@t" } },
    });
    if (error) throw error;
    userId = data.user.id;
  });

  it("creates a profile row from signup metadata", async () => {
    const { data } = await admin().from("profiles").select("*").eq("user_id", userId).single();
    expect(data).toMatchObject({ display_name: "Testy", is_minor: true, consent_given_by: "Parent", role: "student", approved_at: null });
    expect(data.consent_at).not.toBeNull();
  });

  it("has a single settings row defaulting to closed enrollment", async () => {
    const { data } = await admin().from("settings").select("*");
    expect(data).toHaveLength(1);
    expect(data![0].enrollment_open).toBe(false);
  });

  it("cleans up", async () => { await admin().auth.admin.deleteUser(userId); });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm run test:integration` → FAIL: relation "profiles" does not exist.

- [ ] **Step 3: Write the migration** `supabase/migrations/0001_accounts.sql`.

```sql
create type public.user_role as enum ('student','teacher','admin');

create table public.profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  display_name     text not null check (char_length(display_name) between 1 and 60),
  role             public.user_role not null default 'student',
  date_of_birth    date not null,
  is_minor         boolean not null,
  consent_given_by text,
  consent_at       timestamptz,
  social_handles   jsonb not null default '{}',
  timezone         text not null default 'America/New_York',
  approved_at      timestamptz,
  rejected_at      timestamptz,
  admin_note       text,
  created_at       timestamptz not null default now()
);

create table public.settings (
  id               boolean primary key default true check (id),   -- single row
  enrollment_open  boolean not null default false,
  enrollment_note  text
);
insert into public.settings (id) values (true);

create table public.email_sends (
  id      bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  kind    text not null check (kind in ('confirm','reset'))
);
create index on public.email_sends (sent_at desc);

create table public.games (
  slug         text primary key,
  title        text not null,
  url          text not null,
  sort_order   int  not null,
  xp_events    jsonb not null default '{}',
  daily_xp_cap int  not null default 200
);

-- Profile from signup metadata. Runs as the table owner, so it works even though
-- the signing-up user has no session yet.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (user_id, display_name, date_of_birth, is_minor, consent_given_by, consent_at, social_handles)
  values (
    new.id,
    coalesce(m->>'display_name', 'Student'),
    coalesce((m->>'date_of_birth')::date, current_date),
    coalesce((m->>'is_minor')::boolean, false),
    m->>'consent_given_by',
    case when coalesce((m->>'is_minor')::boolean, false) then now() else null end,
    coalesce(m->'social_handles', '{}'::jsonb)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers used by policies. Read the claim, never the table, so policies stay cheap.
create or replace function public.jwt_role() returns text language sql stable as
  $$ select coalesce(auth.jwt()->>'role_name', 'student') $$;
create or replace function public.is_admin() returns boolean language sql stable as
  $$ select public.jwt_role() = 'admin' $$;

alter table public.profiles    enable row level security;
alter table public.settings    enable row level security;
alter table public.email_sends enable row level security;
alter table public.games       enable row level security;

create policy "own profile"        on public.profiles for select using (auth.uid() = user_id);
create policy "admin reads all"    on public.profiles for select using (public.is_admin());
create policy "admin updates"      on public.profiles for update using (public.is_admin());
create policy "anyone reads settings" on public.settings for select using (true);
create policy "admin sets settings"   on public.settings for update using (public.is_admin());
create policy "games are public"   on public.games for select using (true);
-- email_sends: service role only (no policies → only service role can touch it).
```

Note: the JWT claim is named `role_name`, not `role`. Supabase reserves `role` in its tokens for the Postgres role (`authenticated`). Spec §3.5's "role claim" is implemented as `role_name`; Task 3 stamps it and Task 4's `Claims` type exposes it as `role`.

- [ ] **Step 4: Push and run.**

```bash
npm run db:push
npm run test:integration
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase tests && git commit -m "Add the accounts schema: profiles from signup metadata, settings, email sends, games"
```

---

### Task 3: Token hook and Supabase clients

**Files:**
- Create: `supabase/migrations/0002_token_hook.sql`, `lib/auth/cookies.ts`, `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/admin.ts`, `tests/token-hook.integration.test.ts`

**Interfaces:**
- Produces: JWT claims `approved: boolean`, `role_name: 'student'|'teacher'|'admin'`, `display_name: string` on every access token. `cookieOptions(): { domain?, secure, sameSite:'lax', path:'/' }`. `createClient()` (server, cookies from `next/headers`), `createBrowserClient()`, `adminClient()`.

- [ ] **Step 1: Failing integration test.**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { integration, requireEnv } from "./helpers/integration";

describe.skipIf(!integration)("custom access token hook", () => {
  const url = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const admin = () => createClient(url(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const email = `hook-${Date.now()}@example.com`, password = "Passw0rd!Passw0rd!";
  let userId = "";
  beforeAll(async () => {
    const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Hooky", date_of_birth: "2005-01-01", is_minor: false } });
    if (error) throw error; userId = data.user.id;
  });
  afterAll(async () => { await admin().auth.admin.deleteUser(userId); });

  async function claims() {
    const anon = createClient(url(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return decodeJwt(data.session!.access_token) as Record<string, unknown>;
  }

  it("stamps approved=false and role_name=student before approval", async () => {
    expect(await claims()).toMatchObject({ approved: false, role_name: "student", display_name: "Hooky" });
  });
  it("stamps approved=true after approval", async () => {
    await admin().from("profiles").update({ approved_at: new Date().toISOString() }).eq("user_id", userId);
    expect((await claims()).approved).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npm run test:integration` → FAIL: `approved` undefined.

- [ ] **Step 3: Migration** `supabase/migrations/0002_token_hook.sql`.

```sql
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  p record;
begin
  select display_name, role, approved_at into p
  from public.profiles where user_id = (event->>'user_id')::uuid;
  if not found then
    claims := claims || jsonb_build_object('approved', false, 'role_name', 'student', 'display_name', 'Student');
  else
    claims := claims || jsonb_build_object(
      'approved', p.approved_at is not null,
      'role_name', p.role::text,
      'display_name', p.display_name);
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;
create policy "auth admin reads profiles for the hook" on public.profiles
  as permissive for select to supabase_auth_admin using (true);
```

- [ ] **Step 4: Push, then enable the hook.** `npm run db:push`. Dashboard → Authentication → Hooks → Customize Access Token → Postgres function `public.custom_access_token_hook` → Enable. STOP for Scott if the executor lacks dashboard access. Run `npm run test:integration` → PASS.

- [ ] **Step 5: Clients.** `lib/auth/cookies.ts`:

```ts
export const SESSION_COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN || undefined;
export function cookieOptions() {
  return { domain: SESSION_COOKIE_DOMAIN, path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
}
```

`lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/auth/cookies";

export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: cookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC render: proxy.ts refreshes instead */ } },
    },
  });
}
```

`lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions } from "@/lib/auth/cookies";
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: cookieOptions() });
}
```

`lib/supabase/admin.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

`npm i server-only`. Run `npm run typecheck` → clean.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Stamp approval and role into every access token; add Supabase clients with a parent-domain cookie"`

---

### Task 4: JWT verification against the JWKS

**Files:**
- Create: `lib/auth/jwt.ts`, `tests/jwt.test.ts`

**Interfaces:**
- Produces: `type Claims = { sub: string; email?: string; approved: boolean; role: 'student'|'teacher'|'admin'; displayName: string; exp: number }` and `verifyAccessToken(token: string, opts?: { jwks?: JWTVerifyGetKey; issuer?: string }): Promise<Claims | null>`. Returns `null` for any invalid, expired or wrong-issuer token; never throws.

- [ ] **Step 1: Failing unit test** (signs tokens with a throwaway ES256 key; no network).

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { verifyAccessToken } from "@/lib/auth/jwt";

const issuer = "https://test.supabase.co/auth/v1";
let jwks: JWTVerifyGetKey, privateKey: CryptoKey;
beforeAll(async () => {
  const kp = await generateKeyPair("ES256");
  privateKey = kp.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] });
});
const sign = (claims: Record<string, unknown>, exp = "1h") =>
  new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer(issuer).setAudience("authenticated").setSubject("user-1").setIssuedAt().setExpirationTime(exp).sign(privateKey);

describe("verifyAccessToken", () => {
  it("returns claims for a valid token", async () => {
    const c = await verifyAccessToken(await sign({ approved: true, role_name: "admin", display_name: "Scott" }), { jwks, issuer });
    expect(c).toMatchObject({ sub: "user-1", approved: true, role: "admin", displayName: "Scott" });
  });
  it("defaults missing claims safely", async () => {
    const c = await verifyAccessToken(await sign({}), { jwks, issuer });
    expect(c).toMatchObject({ approved: false, role: "student", displayName: "Student" });
  });
  it("returns null when expired", async () => {
    expect(await verifyAccessToken(await sign({ approved: true }, "-1s"), { jwks, issuer })).toBeNull();
  });
  it("returns null for the wrong issuer", async () => {
    expect(await verifyAccessToken(await sign({ approved: true }), { jwks, issuer: "https://other/auth/v1" })).toBeNull();
  });
  it("returns null for garbage", async () => {
    expect(await verifyAccessToken("not.a.jwt", { jwks, issuer })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npm test` → FAIL: cannot find module.

- [ ] **Step 3: Implement** `lib/auth/jwt.ts`.

```ts
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type Role = "student" | "teacher" | "admin";
export type Claims = { sub: string; email?: string; approved: boolean; role: Role; displayName: string; exp: number };

let remote: JWTVerifyGetKey | undefined;
function defaultJwks(): JWTVerifyGetKey {
  if (!remote) {
    remote = createRemoteJWKSet(new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`), { cacheMaxAge: 60 * 60 * 1000 });
  }
  return remote;
}
const ROLES: Role[] = ["student", "teacher", "admin"];

export async function verifyAccessToken(token: string, opts: { jwks?: JWTVerifyGetKey; issuer?: string } = {}): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, opts.jwks ?? defaultJwks(), {
      issuer: opts.issuer ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    const role = ROLES.includes(payload.role_name as Role) ? (payload.role_name as Role) : "student";
    return {
      sub: String(payload.sub), email: typeof payload.email === "string" ? payload.email : undefined,
      approved: payload.approved === true, role,
      displayName: typeof payload.display_name === "string" && payload.display_name ? payload.display_name : "Student",
      exp: Number(payload.exp),
    };
  } catch { return null; }
}
```

- [ ] **Step 4: Run** `npm test` → PASS (5).
- [ ] **Step 5: Commit.** `git commit -am "Verify access tokens against the JWKS with safe claim defaults"`

---

### Task 5: The login gate (`proxy.ts`)

**Files:**
- Create: `lib/auth/claims.ts`, `proxy.ts`, `tests/gate.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`, `Claims` (Task 4).
- Produces: `decideRoute(pathname: string, claims: Claims | null): { kind: 'allow' } | { kind: 'redirect'; to: '/login' | '/waiting' | '/' }` — pure, so games can copy the same table. `proxy.ts` reads the Supabase auth cookie, refreshes the session when needed (the portal is the only refresher), verifies, and applies `decideRoute`.

- [ ] **Step 1: Failing test.**

```ts
import { describe, it, expect } from "vitest";
import { decideRoute } from "@/lib/auth/claims";
const student = { sub: "u", approved: true, role: "student" as const, displayName: "S", exp: 0 };
const pending = { ...student, approved: false };
const admin = { ...student, role: "admin" as const };

describe("decideRoute", () => {
  it.each(["/login", "/signup", "/confirm", "/waiting", "/kit/v1/ts-kit.js", "/api/signup", "/api/me"])("allows public path %s without a session", (p) => {
    expect(decideRoute(p, null)).toEqual({ kind: "allow" });
  });
  it("sends anonymous users to login", () => expect(decideRoute("/", null)).toEqual({ kind: "redirect", to: "/login" }));
  it("sends unapproved users to waiting", () => expect(decideRoute("/progress", pending)).toEqual({ kind: "redirect", to: "/waiting" }));
  it("lets unapproved users see waiting and api/me", () => {
    expect(decideRoute("/waiting", pending)).toEqual({ kind: "allow" });
    expect(decideRoute("/api/me", pending)).toEqual({ kind: "allow" });
  });
  it("allows approved students", () => expect(decideRoute("/shop", student)).toEqual({ kind: "allow" }));
  it("keeps students out of admin", () => expect(decideRoute("/admin/approvals", student)).toEqual({ kind: "redirect", to: "/" }));
  it("lets admins in", () => expect(decideRoute("/admin/settings", admin)).toEqual({ kind: "allow" }));
  it("sends signed-in users away from login", () => expect(decideRoute("/login", student)).toEqual({ kind: "redirect", to: "/" }));
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lib/auth/claims.ts`.

```ts
import type { Claims } from "@/lib/auth/jwt";
export type { Claims };

const PUBLIC = ["/login", "/signup", "/confirm", "/waiting", "/api/signup", "/api/me", "/kit/"];
const AUTH_PAGES = ["/login", "/signup"];

export function decideRoute(pathname: string, claims: Claims | null) {
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));
  if (!claims) return isPublic ? { kind: "allow" as const } : { kind: "redirect" as const, to: "/login" as const };
  if (AUTH_PAGES.includes(pathname) && claims.approved) return { kind: "redirect" as const, to: "/" as const };
  if (!claims.approved) return isPublic ? { kind: "allow" as const } : { kind: "redirect" as const, to: "/waiting" as const };
  if (pathname.startsWith("/admin") && claims.role !== "admin") return { kind: "redirect" as const, to: "/" as const };
  return { kind: "allow" as const };
}
```

`proxy.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { decideRoute } from "@/lib/auth/claims";
import { cookieOptions } from "@/lib/auth/cookies";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: cookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getSession() refreshes an expired access token using the refresh token cookie.
  // This is the ONLY place in the whole platform that refreshes (spec §3.5).
  const { data: { session } } = await supabase.auth.getSession();
  const claims = session ? await verifyAccessToken(session.access_token) : null;
  const decision = decideRoute(request.nextUrl.pathname, claims);
  if (decision.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    url.search = decision.to === "/login" && !request.nextUrl.pathname.startsWith("/api") ? `?next=${encodeURIComponent(request.nextUrl.pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)", "/kit/v1/ts-kit.js"],
};
```

- [ ] **Step 4: Run** `npm test` → PASS; `npm run typecheck` → clean.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Gate every route on a verified token: login, approval, admin"`

---

### Task 6: Signup rules and the email budget

**Files:**
- Create: `lib/signup.ts`, `lib/email-limit.ts`, `tests/signup.test.ts`, `tests/email-limit.test.ts`

**Interfaces:**
- Produces: `signupSchema` (zod), `isMinor(dob: string, today?: Date): boolean`, `toUserMetadata(input): { display_name, date_of_birth, is_minor, consent_given_by?, social_handles }`; `nextAllowedSend(sends: Date[], now: Date, limit = 2, windowMs = 3_600_000): Date | null` (null = allowed now).

- [ ] **Step 1: Failing tests.**

`tests/signup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signupSchema, isMinor, toUserMetadata } from "@/lib/signup";
const today = new Date("2026-09-07");
const base = { displayName: "Ada", dateOfBirth: "2010-09-08", email: "ada@example.com", password: "longenough-pass1", socialHandles: { instagram: "@ada" } };

describe("isMinor", () => {
  it("is a minor the day before the 13th birthday", () => expect(isMinor("2013-09-08", today)).toBe(true));
  it("is not a minor on the 13th birthday", () => expect(isMinor("2013-09-07", today)).toBe(false));
});
describe("signupSchema", () => {
  it("accepts an adult without consent fields", () => expect(signupSchema.safeParse({ ...base, today }).success).toBe(true));
  it("requires parent name and consent for a minor", () => {
    const r = signupSchema.safeParse({ ...base, dateOfBirth: "2016-01-01", today });
    expect(r.success).toBe(false);
  });
  it("accepts a minor with consent", () => {
    expect(signupSchema.safeParse({ ...base, dateOfBirth: "2016-01-01", parentName: "Pat", parentConsent: true, today }).success).toBe(true);
  });
  it("requires at least one social handle", () => expect(signupSchema.safeParse({ ...base, socialHandles: {}, today }).success).toBe(false));
  it("rejects future birthdays and short passwords", () => {
    expect(signupSchema.safeParse({ ...base, dateOfBirth: "2030-01-01", today }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "short", today }).success).toBe(false);
  });
});
describe("toUserMetadata", () => {
  it("maps a minor", () => {
    expect(toUserMetadata({ ...base, dateOfBirth: "2016-01-01", parentName: "Pat", parentConsent: true, today }))
      .toEqual({ display_name: "Ada", date_of_birth: "2016-01-01", is_minor: true, consent_given_by: "Pat", social_handles: { instagram: "@ada" } });
  });
});
```

`tests/email-limit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nextAllowedSend } from "@/lib/email-limit";
const t = (m: number) => new Date(Date.UTC(2026, 8, 7, 12, m));
describe("nextAllowedSend", () => {
  it("allows when fewer than two sends in the last hour", () => expect(nextAllowedSend([t(0)], t(30))).toBeNull());
  it("blocks until the earliest of the two ages out", () => expect(nextAllowedSend([t(0), t(20)], t(30))).toEqual(t(60)));
  it("ignores sends older than an hour", () => expect(nextAllowedSend([t(-70), t(-65), t(10)], t(30))).toBeNull());
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**

`lib/signup.ts`:
```ts
import { z } from "zod";

export function isMinor(dob: string, today = new Date()): boolean {
  const b = new Date(dob + "T00:00:00Z");
  const thirteenth = new Date(Date.UTC(b.getUTCFullYear() + 13, b.getUTCMonth(), b.getUTCDate()));
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return t < thirteenth;
}
const handle = z.string().trim().min(1).max(60);
export const socialHandlesSchema = z.object({ instagram: handle.optional(), youtube: handle.optional(), tiktok: handle.optional(), facebook: handle.optional(), x: handle.optional() })
  .refine((h) => Object.values(h).some(Boolean), { message: "Add at least one social media handle" });

export const signupSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(200),
  socialHandles: socialHandlesSchema,
  parentName: z.string().trim().min(1).max(80).optional(),
  parentConsent: z.boolean().optional(),
  today: z.date().optional(),
}).superRefine((v, ctx) => {
  const today = v.today ?? new Date();
  if (new Date(v.dateOfBirth) > today) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Birthday is in the future" });
  if (isMinor(v.dateOfBirth, today)) {
    if (!v.parentName) ctx.addIssue({ code: "custom", path: ["parentName"], message: "A parent's name is required for students under 13" });
    if (v.parentConsent !== true) ctx.addIssue({ code: "custom", path: ["parentConsent"], message: "A parent must consent for students under 13" });
  }
});
export type SignupInput = z.infer<typeof signupSchema>;

export function toUserMetadata(v: SignupInput) {
  const minor = isMinor(v.dateOfBirth, v.today ?? new Date());
  return { display_name: v.displayName, date_of_birth: v.dateOfBirth, is_minor: minor, ...(minor ? { consent_given_by: v.parentName } : {}), social_handles: v.socialHandles };
}
```

`lib/email-limit.ts`:
```ts
export const EMAIL_LIMIT = 2, EMAIL_WINDOW_MS = 60 * 60 * 1000;
export function nextAllowedSend(sends: Date[], now: Date, limit = EMAIL_LIMIT, windowMs = EMAIL_WINDOW_MS): Date | null {
  const recent = sends.filter((s) => now.getTime() - s.getTime() < windowMs).sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < limit) return null;
  return new Date(recent[recent.length - limit].getTime() + windowMs);
}
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Encode the signup rules: age gate, parent consent, social handle, and the two-an-hour email budget"`

---

### Task 7: Signup route with 429 handling

**Files:**
- Create: `app/api/signup/route.ts`, `tests/signup-route.test.ts`

**Interfaces:**
- Consumes: `signupSchema`, `toUserMetadata` (Task 6), `nextAllowedSend` (Task 6), `adminClient` (Task 3).
- Produces: `POST /api/signup` with JSON body `SignupInput`. Responses: `201 { ok: true }`; `400 { error, issues }`; `403 { error: 'enrollment_closed', note }`; `429 { error: 'email_limit', retryAt: ISO }`. The handler is written as `handleSignup(body, deps)` so it is unit-testable with fakes.

- [ ] **Step 1: Failing test.**

```ts
import { describe, it, expect, vi } from "vitest";
import { handleSignup } from "@/app/api/signup/route";
const good = { displayName: "Ada", dateOfBirth: "2005-01-01", email: "a@b.co", password: "longenough-pass1", socialHandles: { x: "@a" } };
function deps(over: Partial<Parameters<typeof handleSignup>[1]> = {}) {
  return {
    enrollmentOpen: async () => ({ open: true, note: null }),
    recentSends: async () => [] as Date[],
    recordSend: vi.fn(async () => {}),
    signUp: vi.fn(async () => ({ error: null })),
    now: () => new Date("2026-09-07T12:30:00Z"),
    ...over,
  };
}
describe("handleSignup", () => {
  it("rejects bad input with 400", async () => {
    const r = await handleSignup({ ...good, email: "nope" }, deps());
    expect(r.status).toBe(400);
  });
  it("refuses when enrollment is closed", async () => {
    const r = await handleSignup(good, deps({ enrollmentOpen: async () => ({ open: false, note: "Opens Oct 1" }) }));
    expect(r.status).toBe(403); expect(r.body).toMatchObject({ error: "enrollment_closed", note: "Opens Oct 1" });
  });
  it("returns 429 with retryAt when the hour is spent, without calling Supabase", async () => {
    const d = deps({ recentSends: async () => [new Date("2026-09-07T12:00:00Z"), new Date("2026-09-07T12:10:00Z")] });
    const r = await handleSignup(good, d);
    expect(r.status).toBe(429); expect(r.body).toMatchObject({ error: "email_limit", retryAt: "2026-09-07T13:00:00.000Z" });
    expect(d.signUp).not.toHaveBeenCalled();
  });
  it("maps Supabase's own rate limit error to 429", async () => {
    const d = deps({ signUp: vi.fn(async () => ({ error: { code: "over_email_send_rate_limit", message: "x" } })) });
    expect((await handleSignup(good, d)).status).toBe(429);
  });
  it("signs up, records the send, returns 201", async () => {
    const d = deps(); const r = await handleSignup(good, d);
    expect(r.status).toBe(201);
    expect(d.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.co", options: expect.objectContaining({ data: expect.objectContaining({ display_name: "Ada", is_minor: false }) }) }));
    expect(d.recordSend).toHaveBeenCalledWith("confirm");
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `app/api/signup/route.ts`.

```ts
import { NextResponse } from "next/server";
import { signupSchema, toUserMetadata } from "@/lib/signup";
import { nextAllowedSend } from "@/lib/email-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SignUpArgs = { email: string; password: string; options: { data: Record<string, unknown>; emailRedirectTo: string } };
export type SignupDeps = {
  enrollmentOpen: () => Promise<{ open: boolean; note: string | null }>;
  recentSends: () => Promise<Date[]>;
  recordSend: (kind: "confirm" | "reset") => Promise<void>;
  signUp: (args: SignUpArgs) => Promise<{ error: { code?: string; message: string } | null }>;
  now: () => Date;
};
type Result = { status: number; body: Record<string, unknown> };

export async function handleSignup(body: unknown, deps: SignupDeps): Promise<Result> {
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid", issues: parsed.error.issues } };
  const gate = await deps.enrollmentOpen();
  if (!gate.open) return { status: 403, body: { error: "enrollment_closed", note: gate.note } };
  const retryAt = nextAllowedSend(await deps.recentSends(), deps.now());
  if (retryAt) return { status: 429, body: { error: "email_limit", retryAt: retryAt.toISOString() } };
  const { error } = await deps.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { data: toUserMetadata(parsed.data), emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/confirm` },
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { status: 429, body: { error: "email_limit", retryAt: new Date(deps.now().getTime() + 60 * 60 * 1000).toISOString() } };
  }
  if (error) return { status: 400, body: { error: "signup_failed", message: error.message } };
  await deps.recordSend("confirm");
  return { status: 201, body: { ok: true } };
}

export async function POST(request: Request) {
  const admin = adminClient();
  const anon = await createClient();
  const deps: SignupDeps = {
    enrollmentOpen: async () => { const { data } = await admin.from("settings").select("enrollment_open, enrollment_note").single(); return { open: !!data?.enrollment_open, note: data?.enrollment_note ?? null }; },
    recentSends: async () => { const since = new Date(Date.now() - 3_600_000).toISOString(); const { data } = await admin.from("email_sends").select("sent_at").gte("sent_at", since); return (data ?? []).map((r) => new Date(r.sent_at)); },
    recordSend: async (kind) => { await admin.from("email_sends").insert({ kind }); },
    signUp: async (args) => { const { error } = await anon.auth.signUp(args); return { error: error ? { code: (error as { code?: string }).code, message: error.message } : null }; },
    now: () => new Date(),
  };
  const result = await handleSignup(await request.json().catch(() => null), deps);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Run** `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the signup route: enrollment switch, email budget, and honest 429s"`

---

### Task 8: Public pages: signup, confirm, login, waiting, and `/api/me`

**Files:**
- Create: `app/(public)/layout.tsx`, `app/(public)/signup/page.tsx`, `app/(public)/signup/signup-form.tsx`, `app/(public)/confirm/page.tsx`, `app/(public)/login/page.tsx`, `app/(public)/login/login-form.tsx`, `app/(public)/waiting/page.tsx`, `app/(public)/waiting/poll.tsx`, `app/api/me/route.ts`, `tests/me-route.test.ts`

**Interfaces:**
- Consumes: `POST /api/signup` (Task 7), `createClient` browser/server (Task 3), `verifyAccessToken` (Task 4).
- Produces: `GET /api/me → { signedIn: boolean; approved: boolean; displayName?: string }` built by `meFromClaims(claims)`; the pages.

- [ ] **Step 1: Failing test** for the only logic worth testing here, `tests/me-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { meFromClaims } from "@/app/api/me/route";
describe("meFromClaims", () => {
  it("anonymous", () => expect(meFromClaims(null)).toEqual({ signedIn: false, approved: false }));
  it("pending", () => expect(meFromClaims({ sub: "u", approved: false, role: "student", displayName: "A", exp: 0 })).toEqual({ signedIn: true, approved: false, displayName: "A" }));
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `app/api/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAccessToken, type Claims } from "@/lib/auth/jwt";

export function meFromClaims(c: Claims | null) {
  return c ? { signedIn: true, approved: c.approved, displayName: c.displayName } : { signedIn: false, approved: false };
}
export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const claims = session ? await verifyAccessToken(session.access_token) : null;
  return NextResponse.json(meFromClaims(claims), { headers: { "Cache-Control": "no-store" } });
}
```

Note: the waiting page polls this. A token refresh (which changes `approved`) happens in `proxy.ts` on the same request, so the poll sees the new claim within one refresh cycle.

- [ ] **Step 4: Pages.** Keep them plain: one form per page, Tailwind classes, no component library.

`app/(public)/signup/signup-form.tsx` (client component):
```tsx
"use client";
import { useState } from "react";
import { isMinor } from "@/lib/signup";

export function SignupForm() {
  const [f, setF] = useState({ displayName: "", dateOfBirth: "", email: "", password: "", parentName: "", parentConsent: false, instagram: "", youtube: "", tiktok: "", facebook: "", x: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "done" } | { kind: "closed"; note: string | null } | { kind: "limit"; retryAt: string } | { kind: "error"; message: string }>({ kind: "idle" });
  const minor = f.dateOfBirth ? isMinor(f.dateOfBirth) : false;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState({ kind: "busy" });
    const body = { displayName: f.displayName, dateOfBirth: f.dateOfBirth, email: f.email, password: f.password,
      socialHandles: Object.fromEntries(["instagram", "youtube", "tiktok", "facebook", "x"].filter((k) => f[k as keyof typeof f]).map((k) => [k, f[k as keyof typeof f]])),
      ...(minor ? { parentName: f.parentName, parentConsent: f.parentConsent } : {}) };
    const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.status === 201) setState({ kind: "done" });
    else if (r.status === 403) setState({ kind: "closed", note: j.note });
    else if (r.status === 429) setState({ kind: "limit", retryAt: j.retryAt });
    else setState({ kind: "error", message: j.issues?.[0]?.message ?? j.message ?? "Something went wrong" });
  }

  if (state.kind === "done") return <p>Check {minor ? "the parent's" : "your"} email for a confirmation link, then come back and sign in.</p>;
  if (state.kind === "closed") return <p>Enrollment is closed right now. {state.note}</p>;
  return (
    <form onSubmit={submit} className="grid gap-3 max-w-md">
      <label>Date of birth <input type="date" required value={f.dateOfBirth} onChange={set("dateOfBirth")} /></label>
      {minor && <p className="text-sm">Students under 13 sign up with a parent's email. The parent owns the account and signs in with these details.</p>}
      <label>First name <input required value={f.displayName} onChange={set("displayName")} /></label>
      <label>{minor ? "Parent's email" : "Email"} <input type="email" required value={f.email} onChange={set("email")} /></label>
      <label>Password (12+ characters) <input type="password" minLength={12} required value={f.password} onChange={set("password")} /></label>
      {minor && <>
        <label>Parent's name <input required value={f.parentName} onChange={set("parentName")} /></label>
        <label><input type="checkbox" required checked={f.parentConsent} onChange={set("parentConsent")} /> I am the parent and I consent to my child using Travel Schooling.</label>
      </>}
      <fieldset><legend>Where can we find you? (at least one)</legend>
        {(["instagram", "youtube", "tiktok", "facebook", "x"] as const).map((k) => <label key={k}>{k} <input value={f[k]} onChange={set(k)} /></label>)}
      </fieldset>
      {state.kind === "limit" && <p role="alert">We can only send two confirmation emails an hour and both are spoken for. Your details are kept on this page; try again after {new Date(state.retryAt).toLocaleTimeString()}.</p>}
      {state.kind === "error" && <p role="alert">{state.message}</p>}
      <button disabled={state.kind === "busy"}>Sign up</button>
    </form>
  );
}
```

`app/(public)/signup/page.tsx` renders `<h1>Join Travel Schooling</h1><SignupForm/>`. It is a server component that first reads `settings` via `createClient()` and renders the closed message with `enrollment_note` instead of the form when `enrollment_open` is false.

`app/(public)/confirm/page.tsx` (server): reads `?code=` and calls `supabase.auth.exchangeCodeForSession(code)`; on success `redirect("/waiting")`, on failure shows "That link has expired; sign in to request a new one."

`app/(public)/login/login-form.tsx` (client): email + password → `createClient().auth.signInWithPassword`; on success `router.push(searchParams.get("next") ?? "/")` (proxy will bounce unapproved users to `/waiting`). Include a "Forgot password" link that calls `auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` })` and, on an `over_email_send_rate_limit` error, shows "Password reset emails share our two-an-hour limit. Try again in an hour."

`app/(public)/waiting/page.tsx` (server) + `poll.tsx` (client): shows "Thanks, <name>. Scott approves each student by hand after you connect with us on social media:" followed by the school's profile links (from env `NEXT_PUBLIC_SOCIAL_LINKS`, JSON), plus a "Resend confirmation email" button (calls `auth.resend({ type: "signup", email })`, same 429 message). `poll.tsx` fetches `/api/me` every 60 s and does `location.assign("/")` when `approved` is true.

- [ ] **Step 5: Manual check.** `npm run dev`, set `enrollment_open = true` in the Supabase table editor, sign up as an adult and as a minor, confirm both via the emails (two sends: that is the whole hour's budget, so the third signup must show the 429 message; try it), sign in, see the waiting page.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add signup, confirm, login and waiting pages with the two-an-hour email messaging"`

---

### Task 9: Admin approvals and the enrollment switch

**Files:**
- Create: `app/api/admin/approvals/route.ts`, `app/api/admin/settings/route.ts`, `app/admin/approvals/page.tsx`, `app/admin/approvals/actions.tsx`, `app/admin/settings/page.tsx`, `tests/approvals.test.ts`, `tests/approvals.integration.test.ts`

**Interfaces:**
- Consumes: `adminClient` (Task 3), `verifyAccessToken` (Task 4).
- Produces: `applyDecision(row, decision: 'approve'|'reject'|'revoke', now): Partial<ProfileRow>` (pure); `GET /api/admin/approvals → { pending: ProfileRow[] }`; `POST /api/admin/approvals { userId, decision, note? }`; `GET/POST /api/admin/settings { enrollmentOpen, enrollmentNote }`. All admin routes re-verify the token server-side and return 403 unless `role === 'admin'` (proxy already blocks, this is defence in depth).

- [ ] **Step 1: Failing unit test.**

```ts
import { describe, it, expect } from "vitest";
import { applyDecision } from "@/app/api/admin/approvals/route";
const now = new Date("2026-09-07T15:00:00Z");
describe("applyDecision", () => {
  it("approve sets approved_at and clears rejected_at", () => expect(applyDecision("approve", now, "ok")).toEqual({ approved_at: now.toISOString(), rejected_at: null, admin_note: "ok" }));
  it("reject sets rejected_at and clears approved_at", () => expect(applyDecision("reject", now)).toEqual({ approved_at: null, rejected_at: now.toISOString(), admin_note: null }));
  it("revoke clears approved_at only", () => expect(applyDecision("revoke", now, "moved")).toEqual({ approved_at: null, admin_note: "moved" }));
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `app/api/admin/approvals/route.ts`.

```ts
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

export type Decision = "approve" | "reject" | "revoke";
export function applyDecision(decision: Decision, now: Date, note: string | null = null) {
  const at = now.toISOString();
  if (decision === "approve") return { approved_at: at, rejected_at: null, admin_note: note };
  if (decision === "reject") return { approved_at: null, rejected_at: at, admin_note: note };
  return { approved_at: null, admin_note: note };
}

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const claims = session ? await verifyAccessToken(session.access_token) : null;
  return claims?.role === "admin" ? claims : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await adminClient().from("profiles").select("user_id, display_name, is_minor, social_handles, created_at, approved_at, rejected_at, admin_note")
    .is("approved_at", null).is("rejected_at", null).order("created_at");
  const users = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(users.data.users.map((u) => [u.id, u.email]));
  return NextResponse.json({ pending: (data ?? []).map((p) => ({ ...p, email: emailById.get(p.user_id) ?? null })) });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { userId, decision, note } = (await request.json()) as { userId: string; decision: Decision; note?: string };
  if (!["approve", "reject", "revoke"].includes(decision)) return NextResponse.json({ error: "bad decision" }, { status: 400 });
  const { error } = await adminClient().from("profiles").update(applyDecision(decision, new Date(), note ?? null)).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

`app/api/admin/settings/route.ts`: `GET` returns the settings row; `POST { enrollmentOpen, enrollmentNote }` updates it. Both call `requireAdmin()` (import it from the approvals route) and use `adminClient()`.

- [ ] **Step 4: Pages.** `app/admin/approvals/page.tsx` (server) fetches pending via `adminClient()` directly (same query as GET) and renders a table: name, "under 13" badge, email, each social handle as a link (`https://instagram.com/<handle without @>`, `https://youtube.com/@<handle>`, `https://tiktok.com/@<handle>`, `https://facebook.com/<handle>`, `https://x.com/<handle>`), signup time, and `actions.tsx` (client) with Approve / Reject buttons and a note field posting to `/api/admin/approvals`, then `router.refresh()`. Below the pending table, an "Approved students" table with a Revoke button and a note "Revoking locks games within an hour, when the student's token next refreshes." `app/admin/settings/page.tsx`: a checkbox for `enrollment_open` and a text field for `enrollment_note` posting to `/api/admin/settings`.

- [ ] **Step 5: Integration test** `tests/approvals.integration.test.ts`: create a user via `auth.admin.createUser` (as Task 3), `applyDecision("approve")` via a direct `profiles` update using the service role, sign in and assert `approved` claim is `true`; then `revoke`, sign in again, assert `false`. Delete the user in `afterAll`.

- [ ] **Step 6: Make Scott admin.** In the Supabase SQL editor (or `supabase db query`): `update public.profiles set role = 'admin', approved_at = now() where user_id = (select id from auth.users where email = 'scottmacscott@gmail.com');` after Scott has signed up once. STOP for Scott to sign up first.

- [ ] **Step 7: Run** `npm test && npm run test:integration` → PASS. Manual: approve the test student from Task 8 and watch the waiting page forward itself.
- [ ] **Step 8: Commit.** `git add -A && git commit -m "Add the admin approval queue and the enrollment switch"`

---

### Task 10: Rewards ledger, functions and journal

**Files:**
- Create: `supabase/migrations/0003_rewards.sql`, `tests/rewards.integration.test.ts`

**Interfaces:**
- Produces (SQL, callable via `supabase.rpc`): `award(p_game text, p_event text, p_detail jsonb default '{}') returns jsonb` → `{ xp, gems, level, streak, level_up: bool, new_achievements: text[], awarded_xp: int }`; `unlock(p_achievement text) returns jsonb` → same shape; `buy(p_item text) returns jsonb`; tables `reward_ledger`, `reward_totals`, `achievements`, `user_achievements`, `quests`, `shop_items`, `journal_entries` exactly as spec §5. `level_for_xp(xp int) returns int`: level = floor(sqrt(xp / 100)) + 1 (WordWave's curve; check `Word_Wave/src/lib/gamification.ts` and match it if it differs, then update this line).

- [ ] **Step 1: Failing integration test** (needs a `test` game row; the test inserts and removes it).

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { integration, requireEnv } from "./helpers/integration";

describe.skipIf(!integration)("rewards", () => {
  const url = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const admin = () => createClient(url(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const email = `rw-${Date.now()}@example.com`, password = "Passw0rd!Passw0rd!";
  let userId = "", user: SupabaseClient;

  beforeAll(async () => {
    await admin().from("games").upsert({ slug: "testgame", title: "Test", url: "https://example.com", sort_order: 99, xp_events: { tap: { xp: 10, per_day: 3 }, big: { xp: 100, per_day: 1 } }, daily_xp_cap: 120 });
    await admin().from("achievements").upsert({ id: "test-first-tap", game: "testgame", title: "First tap", description: "", icon: "star", gems: 5 });
    await admin().from("shop_items").upsert({ id: "freeze", title: "Streak freeze", price: 10, effect: { streak_freezes: 1 } });
    const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "R", date_of_birth: "2005-01-01", is_minor: false } });
    if (error) throw error; userId = data.user.id;
    await admin().from("profiles").update({ approved_at: new Date().toISOString() }).eq("user_id", userId);
    user = createClient(url(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { error: e2 } = await user.auth.signInWithPassword({ email, password }); if (e2) throw e2;
  });
  afterAll(async () => { await admin().auth.admin.deleteUser(userId); await admin().from("games").delete().eq("slug", "testgame"); });

  it("awards xp and starts a streak", async () => {
    const { data, error } = await user.rpc("award", { p_game: "testgame", p_event: "tap" });
    expect(error).toBeNull(); expect(data).toMatchObject({ awarded_xp: 10, xp: 10, level: 1, streak: 1 });
  });
  it("rejects unknown events", async () => {
    const { error } = await user.rpc("award", { p_game: "testgame", p_event: "nope" });
    expect(error?.message).toMatch(/unknown event/);
  });
  it("caps per-event per day", async () => {
    await user.rpc("award", { p_game: "testgame", p_event: "tap" }); await user.rpc("award", { p_game: "testgame", p_event: "tap" });
    const { data } = await user.rpc("award", { p_game: "testgame", p_event: "tap" });
    expect(data.awarded_xp).toBe(0); expect(data.xp).toBe(30);
  });
  it("caps daily xp for the game", async () => {
    const { data } = await user.rpc("award", { p_game: "testgame", p_event: "big" });
    expect(data.awarded_xp).toBe(90); expect(data.xp).toBe(120);
  });
  it("levels up and pays gems at 100 xp", async () => {
    const { data } = await admin().from("reward_totals").select("*").eq("user_id", userId).single();
    expect(data.level).toBe(2); expect(data.gems).toBeGreaterThan(0);
  });
  it("unlocks an achievement once and pays its gems once", async () => {
    const a = await user.rpc("unlock", { p_achievement: "test-first-tap" }); const gemsAfter = a.data.gems;
    const b = await user.rpc("unlock", { p_achievement: "test-first-tap" });
    expect(a.data.new_achievements).toEqual(["test-first-tap"]); expect(b.data.new_achievements).toEqual([]); expect(b.data.gems).toBe(gemsAfter);
  });
  it("buys a freeze and refuses when broke", async () => {
    const { data } = await user.rpc("buy", { p_item: "freeze" }); expect(data.streak_freezes).toBe(1);
    await admin().from("reward_totals").update({ gems: 0 }).eq("user_id", userId);
    const { error } = await user.rpc("buy", { p_item: "freeze" }); expect(error?.message).toMatch(/not enough gems/);
  });
  it("forbids direct writes to the ledger and totals", async () => {
    const { error } = await user.from("reward_ledger").insert({ user_id: userId, kind: "xp", event: "hack", amount: 9999 });
    expect(error).not.toBeNull();
  });
  it("journal: one entry per day, editable today only", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await user.from("journal_entries").insert({ user_id: userId, game: "testgame", entry_date: today, body: "practised" })).error).toBeNull();
    expect((await user.from("journal_entries").upsert({ user_id: userId, game: "testgame", entry_date: today, body: "practised more" })).error).toBeNull();
    expect((await user.from("journal_entries").insert({ user_id: userId, game: "testgame", entry_date: "2020-01-01", body: "old" })).error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npm run test:integration` → FAIL: function award does not exist.
- [ ] **Step 3: Migration** `supabase/migrations/0003_rewards.sql`.

```sql
create table public.reward_ledger (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  game    text references public.games,
  kind    text not null check (kind in ('xp','gems')),
  event   text not null,
  amount  int  not null,
  detail  jsonb not null default '{}',
  at      timestamptz not null default now()
);
create index on public.reward_ledger (user_id, at desc);
create index on public.reward_ledger (user_id, game, event, at desc);

create table public.reward_totals (
  user_id        uuid primary key references auth.users on delete cascade,
  xp             int  not null default 0,
  level          int  not null default 1,
  gems           int  not null default 0,
  streak         int  not null default 0,
  streak_freezes int  not null default 0,
  last_active    date
);
create table public.achievements (
  id text primary key, game text references public.games, title text not null,
  description text not null default '', icon text not null default 'star', gems int not null default 0
);
create table public.user_achievements (
  user_id uuid references auth.users on delete cascade, achievement text references public.achievements,
  at timestamptz not null default now(), primary key (user_id, achievement)
);
create table public.quests (
  id text primary key, title text not null, rule jsonb not null, gems int not null
);
create table public.user_quests (
  user_id uuid references auth.users on delete cascade, quest text references public.quests,
  quest_date date not null, completed_at timestamptz, primary key (user_id, quest, quest_date)
);
create table public.shop_items (
  id text primary key, title text not null, price int not null, effect jsonb not null
);
create table public.journal_entries (
  user_id    uuid references auth.users on delete cascade,
  game       text references public.games,
  entry_date date not null,
  body       text not null check (char_length(body) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, game, entry_date)
);

create or replace function public.level_for_xp(p_xp int) returns int language sql immutable as
  $$ select floor(sqrt(greatest(p_xp, 0) / 100.0))::int + 1 $$;

create or replace function public.user_today() returns date language sql stable as
  $$ select (now() at time zone coalesce((select timezone from public.profiles where user_id = auth.uid()), 'America/New_York'))::date $$;

-- Streak: consecutive days with any xp. Called inside award() after the ledger insert.
create or replace function public.touch_streak(p_user uuid, p_today date) returns void
language plpgsql as $$
declare t public.reward_totals;
begin
  select * into t from public.reward_totals where user_id = p_user for update;
  if t.last_active = p_today then return; end if;
  if t.last_active = p_today - 1 then
    update public.reward_totals set streak = streak + 1, last_active = p_today where user_id = p_user;
  elsif t.last_active = p_today - 2 and t.streak_freezes > 0 then
    update public.reward_totals set streak = streak + 1, streak_freezes = streak_freezes - 1, last_active = p_today where user_id = p_user;
    insert into public.reward_ledger (user_id, kind, event, amount, detail) values (p_user, 'gems', 'streak_freeze_used', 0, '{}');
  else
    update public.reward_totals set streak = 1, last_active = p_today where user_id = p_user;
  end if;
end $$;

create or replace function public.totals_json(p_user uuid, p_awarded int, p_level_up boolean, p_new text[]) returns jsonb
language sql stable as $$
  select jsonb_build_object('xp', xp, 'gems', gems, 'level', level, 'streak', streak, 'streak_freezes', streak_freezes,
    'awarded_xp', p_awarded, 'level_up', p_level_up, 'new_achievements', to_jsonb(coalesce(p_new, '{}')))
  from public.reward_totals where user_id = p_user $$;

create or replace function public.award(p_game text, p_event text, p_detail jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid(); today date := public.user_today();
  ev jsonb; xp_val int; per_day int; cap int;
  used_event int; used_game int; grant_xp int;
  old_level int; new_level int; level_gems int := 0;
begin
  if u is null then raise exception 'not signed in'; end if;
  select xp_events->p_event, daily_xp_cap into ev, cap from public.games where slug = p_game;
  if ev is null then raise exception 'unknown event % for game %', p_event, p_game; end if;
  xp_val := (ev->>'xp')::int; per_day := coalesce((ev->>'per_day')::int, 1000000);
  insert into public.reward_totals (user_id) values (u) on conflict do nothing;
  select count(*) into used_event from public.reward_ledger where user_id = u and game = p_game and event = p_event and kind = 'xp' and (at at time zone 'UTC')::date = today;
  select coalesce(sum(amount), 0) into used_game from public.reward_ledger where user_id = u and game = p_game and kind = 'xp' and (at at time zone 'UTC')::date = today;
  grant_xp := case when used_event >= per_day then 0 else least(xp_val, greatest(cap - used_game, 0)) end;
  select level into old_level from public.reward_totals where user_id = u;
  if grant_xp > 0 then
    insert into public.reward_ledger (user_id, game, kind, event, amount, detail) values (u, p_game, 'xp', p_event, grant_xp, p_detail);
    update public.reward_totals set xp = xp + grant_xp, level = public.level_for_xp(xp + grant_xp) where user_id = u returning level into new_level;
    if new_level > old_level then
      level_gems := 20 * (new_level - old_level);
      insert into public.reward_ledger (user_id, game, kind, event, amount, detail) values (u, null, 'gems', 'level_up', level_gems, jsonb_build_object('level', new_level));
      update public.reward_totals set gems = gems + level_gems where user_id = u;
    end if;
    perform public.touch_streak(u, today);
  else
    new_level := old_level;
  end if;
  return public.totals_json(u, grant_xp, new_level > old_level, '{}');
end $$;

create or replace function public.unlock(p_achievement text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); g int; inserted boolean;
begin
  if u is null then raise exception 'not signed in'; end if;
  select gems into g from public.achievements where id = p_achievement;
  if g is null then raise exception 'unknown achievement %', p_achievement; end if;
  insert into public.reward_totals (user_id) values (u) on conflict do nothing;
  insert into public.user_achievements (user_id, achievement) values (u, p_achievement) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted and g > 0 then
    insert into public.reward_ledger (user_id, kind, event, amount, detail) values (u, 'gems', 'achievement', g, jsonb_build_object('achievement', p_achievement));
    update public.reward_totals set gems = gems + g where user_id = u;
  end if;
  return public.totals_json(u, 0, false, case when inserted then array[p_achievement] else '{}' end);
end $$;

create or replace function public.buy(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); price int; effect jsonb; have int;
begin
  if u is null then raise exception 'not signed in'; end if;
  select i.price, i.effect into price, effect from public.shop_items i where id = p_item;
  if price is null then raise exception 'unknown item %', p_item; end if;
  select gems into have from public.reward_totals where user_id = u for update;
  if coalesce(have, 0) < price then raise exception 'not enough gems'; end if;
  insert into public.reward_ledger (user_id, kind, event, amount, detail) values (u, 'gems', 'shop:' || p_item, -price, effect);
  update public.reward_totals set gems = gems - price,
    streak_freezes = streak_freezes + coalesce((effect->>'streak_freezes')::int, 0) where user_id = u;
  return public.totals_json(u, 0, false, '{}');
end $$;

alter table public.reward_ledger enable row level security;
alter table public.reward_totals enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.shop_items enable row level security;
alter table public.journal_entries enable row level security;

create policy "own ledger"   on public.reward_ledger for select using (auth.uid() = user_id or public.is_admin());
create policy "own totals"   on public.reward_totals for select using (auth.uid() = user_id or public.is_admin());
create policy "public catalogues" on public.achievements for select using (true);
create policy "public quests"     on public.quests for select using (true);
create policy "public shop"       on public.shop_items for select using (true);
create policy "own achievements"  on public.user_achievements for select using (auth.uid() = user_id or public.is_admin());
create policy "own quests"        on public.user_quests for select using (auth.uid() = user_id or public.is_admin());
create policy "journal read"      on public.journal_entries for select using (auth.uid() = user_id or public.is_admin());
create policy "journal write today" on public.journal_entries for insert with check (auth.uid() = user_id and entry_date = public.user_today());
create policy "journal edit today"  on public.journal_entries for update using (auth.uid() = user_id and entry_date = public.user_today());
grant execute on function public.award, public.unlock, public.buy to authenticated;
revoke execute on function public.touch_streak, public.totals_json from public, anon, authenticated;
```

Quests are evaluated by the launcher page in Task 11 from the ledger (spec §4.1 says server-side; a Postgres function `check_quests()` that reads today's ledger against `quests.rule = {"xp_today": 30}` and inserts `user_quests` with the gem award follows the exact shape of `unlock` and is added in Task 14 with the seed, since it needs quest rows to test).

- [ ] **Step 4: Push and run.** `npm run db:push && npm run test:integration` → PASS (10).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the school-wide rewards ledger: award, unlock, buy, streaks, and the journal"`

---

### Task 11: Launcher, progress, achievements, shop

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/progress/page.tsx`, `app/(app)/achievements/page.tsx`, `app/(app)/shop/page.tsx`, `app/(app)/shop/buy-button.tsx`, `app/api/shop/route.ts`, `lib/rewards/queries.ts`, `tests/rewards-queries.test.ts`

**Interfaces:**
- Consumes: tables and functions from Task 10, `createClient` server (Task 3).
- Produces: `lib/rewards/queries.ts` with `getDashboard(supabase, userId) → { totals, games: (Game & { summary })[], achievements, recentEvents }` and pure `formatTimeline(ledger[]) → { at, text }[]`.

- [ ] **Step 1: Failing test** for the pure part.

```ts
import { describe, it, expect } from "vitest";
import { formatTimeline } from "@/lib/rewards/queries";
describe("formatTimeline", () => {
  it("describes ledger rows in words", () => {
    const rows = [
      { at: "2026-09-07T10:00:00Z", game: "wordforge", kind: "xp", event: "word_forged", amount: 10, detail: {} },
      { at: "2026-09-07T10:05:00Z", game: null, kind: "gems", event: "level_up", amount: 20, detail: { level: 2 } },
      { at: "2026-09-07T10:06:00Z", game: null, kind: "gems", event: "shop:freeze", amount: -10, detail: {} },
    ];
    expect(formatTimeline(rows, { wordforge: "Word Forge" }).map((t) => t.text)).toEqual([
      "+10 XP in Word Forge (word forged)", "Level 2! +20 gems", "Bought freeze for 10 gems",
    ]);
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lib/rewards/queries.ts`.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
export type LedgerRow = { at: string; game: string | null; kind: string; event: string; amount: number; detail: Record<string, unknown> };

export function formatTimeline(rows: LedgerRow[], titles: Record<string, string>) {
  return rows.map((r) => {
    const where = r.game ? ` in ${titles[r.game] ?? r.game}` : "";
    let text: string;
    if (r.event === "level_up") text = `Level ${r.detail.level}! +${r.amount} gems`;
    else if (r.event.startsWith("shop:")) text = `Bought ${r.event.slice(5)} for ${-r.amount} gems`;
    else if (r.event === "achievement") text = `Achievement: ${r.detail.achievement} (+${r.amount} gems)`;
    else if (r.event === "streak_freeze_used") text = "Streak freeze used";
    else text = `+${r.amount} ${r.kind === "xp" ? "XP" : "gems"}${where} (${r.event.replace(/_/g, " ")})`;
    return { at: r.at, text };
  });
}

export async function getDashboard(supabase: SupabaseClient, userId: string) {
  const [totals, games, progress, achievements, ledger] = await Promise.all([
    supabase.from("reward_totals").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("games").select("slug, title, url, sort_order").order("sort_order"),
    supabase.from("game_progress").select("game, summary, updated_at").eq("user_id", userId),
    supabase.from("user_achievements").select("achievement, at, achievements(title, description, icon, game)").eq("user_id", userId),
    supabase.from("reward_ledger").select("at, game, kind, event, amount, detail").eq("user_id", userId).order("at", { ascending: false }).limit(50),
  ]);
  const summaries = new Map((progress.data ?? []).map((p) => [p.game, p]));
  const titles = Object.fromEntries((games.data ?? []).map((g) => [g.slug, g.title]));
  return {
    totals: totals.data ?? { xp: 0, level: 1, gems: 0, streak: 0, streak_freezes: 0 },
    games: (games.data ?? []).map((g) => ({ ...g, summary: summaries.get(g.slug)?.summary ?? null, updatedAt: summaries.get(g.slug)?.updated_at ?? null })),
    achievements: achievements.data ?? [],
    timeline: formatTimeline((ledger.data ?? []) as LedgerRow[], titles),
  };
}
```

`game_progress` is created in Task 12's migration (it belongs with the kit). Add it there; this query compiles against it.

- [ ] **Step 4: Pages.** All server components using `createClient()` and `supabase.auth.getUser()` for the id (proxy guarantees a session).
  - `(app)/layout.tsx`: header with name, level, XP, streak (fire icon), gems; nav Home · Progress · Achievements · Shop · (Admin if role admin) · Sign out (a form posting to `/api/signout`, which calls `supabase.auth.signOut()` and redirects to `/login`; add that route here).
  - `(app)/page.tsx` launcher: one card per game with title, "Play" link to `url`, and `summary.headline` or "Not started".
  - `(app)/progress/page.tsx`: per-game summary cards, then the timeline list.
  - `(app)/achievements/page.tsx`: all `achievements` grouped by game, earned ones highlighted with the date.
  - `(app)/shop/page.tsx` + `buy-button.tsx` (client → `POST /api/shop { item }`): lists `shop_items`, disables items costing more than the balance.
  - `app/api/shop/route.ts`: `POST` → `supabase.rpc("buy", { p_item })` with the user's server client; maps a thrown `not enough gems` to `400`.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build` → clean. Manual: sign in as the approved test student, see zeros, then in the SQL editor call `select award('testgame','tap')` as that user is not possible, so instead run Task 10's integration test again and reload the dashboard: XP, level 2 and the timeline appear.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the launcher, progress timeline, achievements and shop pages"`

---

### Task 12: The game kit and `game_progress`

**Files:**
- Create: `supabase/migrations/0004_game_progress.sql`, `public/kit/v1/ts-kit.js`, `tests/kit.test.ts`

**Interfaces:**
- Produces: table `game_progress` (spec §5) with RLS "own rows"; global `TSKit` with `init({ game, portal?, supabaseUrl?, anonKey? }) → kit`, `kit.user`, `kit.totals`, `kit.load()`, `kit.save(state, summary)`, `kit.award(event, detail)`, `kit.unlock(id)`, `kit.journal.save(text)`, `kit.journal.list({limit})`, `kit.launcherUrl`, `kit.toast(text)`. The kit reads the Supabase auth cookie set by the portal, decodes (does not verify) the access token for `sub`, `exp`, `display_name`, `role_name`, and talks to Supabase REST/RPC with `Authorization: Bearer <token>` and `apikey: <anon key>`.

- [ ] **Step 1: Migration** `supabase/migrations/0004_game_progress.sql`.

```sql
create table public.game_progress (
  user_id    uuid references auth.users on delete cascade,
  game       text references public.games,
  state      jsonb not null default '{}',
  summary    jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.game_progress enable row level security;
create policy "own progress read"  on public.game_progress for select using (auth.uid() = user_id or public.is_admin());
create policy "own progress write" on public.game_progress for insert with check (auth.uid() = user_id);
create policy "own progress edit"  on public.game_progress for update using (auth.uid() = user_id);
```

`npm run db:push`.

- [ ] **Step 2: Failing unit tests** (node environment; fake `document.cookie`, `localStorage`, `fetch`, `location`).

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function token(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "ES256" })}.${b64({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, display_name: "Ada", role_name: "student", ...claims })}.sig`;
}
function boot(cookie: string) {
  const store = new Map<string, string>();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => (String(url).includes("/rpc/") ? { xp: 10, gems: 0, level: 1, streak: 1, awarded_xp: 10, level_up: false, new_achievements: [] } : []) }));
  const ctx: Record<string, unknown> = {
    document: { cookie }, localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    location: { href: "https://wordforge.travelschooling.com/", assign: vi.fn() }, fetch, setTimeout, clearTimeout, console, JSON, Promise, Date, atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync("public/kit/v1/ts-kit.js", "utf8"), ctx);
  return { ctx, fetch, store };
}
const opts = { game: "wordforge", portal: "https://class.travelschooling.com", supabaseUrl: "https://x.supabase.co", anonKey: "anon" };

describe("ts-kit", () => {
  it("redirects to the portal login when there is no session", async () => {
    const { ctx } = boot("");
    const kit = await (ctx.TSKit as any).init(opts);
    expect(kit.user).toBeNull();
    expect((ctx.location as any).assign).toHaveBeenCalledWith("https://class.travelschooling.com/login?next=" + encodeURIComponent("https://wordforge.travelschooling.com/"));
  });
  it("reads the user from the auth cookie", async () => {
    const t = token({});
    const { ctx } = boot(`sb-x-auth-token=${encodeURIComponent(JSON.stringify({ access_token: t }))}`);
    const kit = await (ctx.TSKit as any).init(opts);
    expect(kit.user).toEqual({ id: "u1", displayName: "Ada", role: "student" });
  });
  it("saves progress with the bearer token and caches it locally", async () => {
    const t = token({});
    const { ctx, fetch, store } = boot(`sb-x-auth-token=${encodeURIComponent(JSON.stringify({ access_token: t }))}`);
    const kit = await (ctx.TSKit as any).init(opts);
    await kit.save({ a: 1 }, { headline: "1 word" });
    const call = fetch.mock.calls.find((c) => String(c[0]).includes("/rest/v1/game_progress"))!;
    expect((call[1] as any).headers.Authorization).toBe(`Bearer ${t}`);
    expect(JSON.parse((call[1] as any).body)).toMatchObject({ user_id: "u1", game: "wordforge", state: { a: 1 }, summary: { headline: "1 word" } });
    expect(JSON.parse(store.get("tskit:wordforge:u1")!)).toMatchObject({ state: { a: 1 } });
  });
  it("award calls the rpc and returns what changed", async () => {
    const t = token({});
    const { ctx } = boot(`sb-x-auth-token=${encodeURIComponent(JSON.stringify({ access_token: t }))}`);
    const kit = await (ctx.TSKit as any).init(opts);
    expect(await kit.award("word_forged", { word: "aqua" })).toMatchObject({ awarded_xp: 10, streak: 1 });
    expect(kit.totals.xp).toBe(10);
  });
  it("replays a queued award saved while offline", async () => {
    const t = token({});
    const first = boot(`sb-x-auth-token=${encodeURIComponent(JSON.stringify({ access_token: t }))}`);
    first.fetch.mockRejectedValueOnce(new Error("offline"));
    const kit = await (first.ctx.TSKit as any).init(opts);
    await kit.award("word_forged", {});
    expect(JSON.parse(first.store.get("tskit:wordforge:u1:queue")!)).toHaveLength(1);
    // second boot with the same storage replays
    const second = boot(`sb-x-auth-token=${encodeURIComponent(JSON.stringify({ access_token: t }))}`);
    (second.ctx.localStorage as any).setItem("tskit:wordforge:u1:queue", first.store.get("tskit:wordforge:u1:queue")!);
    await (second.ctx.TSKit as any).init(opts);
    expect(second.fetch.mock.calls.some((c) => String(c[0]).includes("/rpc/award"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** `public/kit/v1/ts-kit.js` (plain script, no modules, ES2019 only so it runs in the HTML-file game).

```js
/* Travel Schooling game kit v1. Include with:
   <script src="https://class.travelschooling.com/kit/v1/ts-kit.js"></script>
   const kit = await TSKit.init({ game: "wordforge" });
   The portal sets the session cookie on .travelschooling.com; this file only reads it.
   It never refreshes tokens: on expiry it sends the learner to the portal (spec §3.5). */
(function (root) {
  var DEFAULTS = { portal: "https://class.travelschooling.com", supabaseUrl: "__SUPABASE_URL__", anonKey: "__SUPABASE_ANON_KEY__" };

  function readCookieToken() {
    var parts = (root.document.cookie || "").split(/;\s*/);
    var chunks = [];
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^(sb-[^=]*-auth-token(?:\.(\d+))?)=(.*)$/);
      if (m) chunks.push({ idx: m[2] ? parseInt(m[2], 10) : 0, val: m[3] });
    }
    if (!chunks.length) return null;
    chunks.sort(function (a, b) { return a.idx - b.idx; });
    var raw = decodeURIComponent(chunks.map(function (c) { return c.val; }).join(""));
    if (raw.indexOf("base64-") === 0) raw = root.atob(raw.slice(7));
    try { return JSON.parse(raw).access_token || null; } catch (e) { return null; }
  }
  function decode(token) {
    try {
      var payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(root.atob(payload).split("").map(function (c) { return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2); }).join("")));
    } catch (e) { return null; }
  }

  function init(options) {
    var o = Object.assign({}, DEFAULTS, options || {});
    if (!o.game) throw new Error("TSKit.init needs { game }");
    var token = readCookieToken();
    var claims = token ? decode(token) : null;
    var now = Math.floor(Date.now() / 1000);
    var loginUrl = o.portal + "/login?next=" + encodeURIComponent(root.location.href);
    var kit = { user: null, totals: { xp: 0, gems: 0, level: 1, streak: 0 }, launcherUrl: o.portal, journal: {} };
    if (!claims || !claims.sub || !claims.exp || claims.exp <= now) {
      root.location.assign(loginUrl);
      return Promise.resolve(kit);
    }
    kit.user = { id: claims.sub, displayName: claims.display_name || "Student", role: claims.role_name || "student" };
    var uid = claims.sub, cacheKey = "tskit:" + o.game + ":" + uid, queueKey = cacheKey + ":queue";
    var headers = { apikey: o.anonKey, Authorization: "Bearer " + token, "Content-Type": "application/json" };

    function api(path, init) {
      return root.fetch(o.supabaseUrl + path, Object.assign({ headers: headers }, init)).then(function (r) {
        if (r.status === 401) { root.location.assign(loginUrl); throw new Error("session expired"); }
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ("HTTP " + r.status)); });
        return r.status === 204 ? null : r.json();
      });
    }
    function ls(key, val) {
      try { if (val === undefined) { var v = root.localStorage.getItem(key); return v ? JSON.parse(v) : null; } root.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
    }
    function rpc(name, args) {
      return api("/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify(args) }).then(function (t) {
        if (t && typeof t.xp === "number") kit.totals = { xp: t.xp, gems: t.gems, level: t.level, streak: t.streak };
        return t;
      });
    }

    kit.load = function () {
      return api("/rest/v1/game_progress?select=state,summary,updated_at&game=eq." + encodeURIComponent(o.game) + "&user_id=eq." + uid)
        .then(function (rows) { var server = rows && rows[0]; var local = ls(cacheKey);
          if (local && local.dirty) return local.state;               // unsent local edit wins until it syncs
          if (server) { ls(cacheKey, { state: server.state, summary: server.summary }); return server.state; }
          return local ? local.state : {}; })
        .catch(function () { var local = ls(cacheKey); return local ? local.state : {}; });
    };

    var saveTimer = null, pending = null;
    function flush() {
      if (!pending) return Promise.resolve();
      var p = pending; pending = null;
      return api("/rest/v1/game_progress?on_conflict=user_id,game", { method: "POST", headers: Object.assign({ Prefer: "resolution=merge-duplicates" }, headers),
        body: JSON.stringify({ user_id: uid, game: o.game, state: p.state, summary: p.summary, updated_at: new Date().toISOString() }) })
        .then(function () { ls(cacheKey, { state: p.state, summary: p.summary }); })
        .catch(function () { ls(cacheKey, { state: p.state, summary: p.summary, dirty: true }); });
    }
    kit.save = function (state, summary) {
      pending = { state: state, summary: summary || {} };
      ls(cacheKey, { state: state, summary: summary || {}, dirty: true });
      if (saveTimer) root.clearTimeout(saveTimer);
      return new Promise(function (resolve) { saveTimer = root.setTimeout(function () { flush().then(resolve, resolve); }, 300); });
    };

    kit.award = function (event, detail) {
      return rpc("award", { p_game: o.game, p_event: event, p_detail: detail || {} }).catch(function (err) {
        if (/session expired|unknown event|not signed in/.test(err.message)) throw err;
        var q = ls(queueKey) || []; q.push({ event: event, detail: detail || {}, at: Date.now() }); ls(queueKey, q);
        return { queued: true, awarded_xp: 0, xp: kit.totals.xp, gems: kit.totals.gems, level: kit.totals.level, streak: kit.totals.streak, level_up: false, new_achievements: [] };
      });
    };
    kit.unlock = function (id) { return rpc("unlock", { p_achievement: id }); };
    kit.journal.save = function (text) {
      var today = new Date().toISOString().slice(0, 10);
      return api("/rest/v1/journal_entries?on_conflict=user_id,game,entry_date", { method: "POST", headers: Object.assign({ Prefer: "resolution=merge-duplicates" }, headers),
        body: JSON.stringify({ user_id: uid, game: o.game, entry_date: today, body: text, updated_at: new Date().toISOString() }) });
    };
    kit.journal.list = function (opts) {
      var limit = (opts && opts.limit) || 30;
      return api("/rest/v1/journal_entries?select=entry_date,body,updated_at&game=eq." + encodeURIComponent(o.game) + "&user_id=eq." + uid + "&order=entry_date.desc&limit=" + limit);
    };
    kit.toast = function (text) {
      if (!root.document.body) return;
      var el = root.document.createElement("div"); el.textContent = text;
      el.setAttribute("style", "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:999px;font:600 14px system-ui;z-index:99999");
      root.document.body.appendChild(el); root.setTimeout(function () { el.remove(); }, 2500);
    };

    // Replay awards queued while offline, then fetch totals.
    var queued = ls(queueKey) || [];
    var replay = queued.reduce(function (p, q) { return p.then(function () { return rpc("award", { p_game: o.game, p_event: q.event, p_detail: q.detail }).catch(function () {}); }); }, Promise.resolve())
      .then(function () { ls(queueKey, []); });
    var local = ls(cacheKey); if (local && local.dirty) { pending = { state: local.state, summary: local.summary }; }
    return replay.then(flush).then(function () {
      return api("/rest/v1/reward_totals?select=xp,gems,level,streak&user_id=eq." + uid).then(function (rows) { if (rows && rows[0]) kit.totals = rows[0]; }).catch(function () {});
    }).then(function () { return kit; });
  }
  root.TSKit = { init: init, version: 1 };
})(typeof window !== "undefined" ? window : this);
```

The two `__SUPABASE_*__` placeholders are replaced at build time: add to `package.json` `"prebuild": "node scripts/stamp-kit.mjs"` where the script reads `public/kit/v1/ts-kit.js`, replaces the placeholders with `process.env.NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and writes the result to the same path (commit the placeholder version; the CI build stamps it). Games can also pass `supabaseUrl` and `anonKey` explicitly, which the tests do.

- [ ] **Step 5: Run** `npm test` → PASS (5 kit tests). Serve it: `npm run dev` and open `http://localhost:3000/kit/v1/ts-kit.js` → the file, and proxy allows it without a session.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the game kit: session from the portal cookie, progress, awards with an offline queue, journal"`

---

### Task 13: Deploy to Vercel and attach `class.travelschooling.com`

**Files:**
- Modify: `.env.example` (document `SESSION_COOKIE_DOMAIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SOCIAL_LINKS`), `README.md` (create: local dev, env, migrations, deploy loop).

- [ ] **Step 1: Production env.**

```bash
vercel env add SESSION_COOKIE_DOMAIN production      # value: .travelschooling.com
vercel env add NEXT_PUBLIC_SITE_URL production        # value: https://class.travelschooling.com
vercel env add NEXT_PUBLIC_SOCIAL_LINKS production    # value: JSON like {"instagram":"https://instagram.com/travelschooling"}
```

STOP for Scott to supply the social links.

- [ ] **Step 2: Deploy.** `vercel deploy --prod --yes`. Expected: a `*.vercel.app` URL that redirects `/` to `/login`.
- [ ] **Step 3: Domain.** `vercel domains add class.travelschooling.com`. At Hostinger DNS for travelschooling.com add `CNAME class → cname.vercel-dns.com`. STOP for Scott. Then `vercel domains inspect class.travelschooling.com` until it reports configured and the certificate issued.
- [ ] **Step 4: Supabase URL config.** Confirm Site URL and redirect URLs from Task 0 step 5 match the live domain.
- [ ] **Step 5: Smoke test in a private window:** signup as a new adult (this spends one of the two hourly emails), confirm, sign in, see waiting; approve from `/admin/approvals` as Scott; the waiting page forwards to the launcher within a minute. Check in the browser devtools that the auth cookie's Domain is `.travelschooling.com`.
- [ ] **Step 6: Commit and push.** `git add -A && git commit -m "Document deploy and env for class.travelschooling.com" && git push`. Push-to-main now deploys production.

---

### Task 14: Seed the catalogue and daily quests

**Files:**
- Create: `supabase/seed.sql`, `supabase/migrations/0005_quests.sql`, `tests/quests.integration.test.ts`

**Interfaces:**
- Produces: `games` rows for `wordwave`, `horizon`, `wordforge`, `katas` with the `xp_events` from spec §7.2 to §7.5 and their achievements; `shop_items` (`freeze` 10 gems, `frame-bronze` 25, `frame-silver` 60); `quests` (`daily-30xp` rule `{"xp_today":30}` 5 gems, `daily-two-games` rule `{"games_today":2}` 10 gems); `check_quests() returns jsonb` → `{ completed: text[] , gems }`, called by the launcher on load.

- [ ] **Step 1: Failing integration test:** as in Task 10, create an approved user, `award` 30 XP on `testgame` (needs a `per_day` of at least 3 for `tap`), call `rpc("check_quests")`, expect `completed` to contain `daily-30xp` and gems to have risen by 5; call again, expect `completed` empty and gems unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Migration** `0005_quests.sql`:

```sql
create or replace function public.check_quests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); today date := public.user_today(); q record; done text[] := '{}';
  xp_today int; games_today int; met boolean;
begin
  if u is null then raise exception 'not signed in'; end if;
  select coalesce(sum(amount), 0), count(distinct game) into xp_today, games_today
    from public.reward_ledger where user_id = u and kind = 'xp' and (at at time zone 'UTC')::date = today;
  for q in select * from public.quests loop
    met := (q.rule ? 'xp_today' and xp_today >= (q.rule->>'xp_today')::int)
        or (q.rule ? 'games_today' and games_today >= (q.rule->>'games_today')::int);
    if met then
      insert into public.user_quests (user_id, quest, quest_date, completed_at) values (u, q.id, today, now()) on conflict do nothing;
      if found then
        done := done || q.id;
        insert into public.reward_ledger (user_id, kind, event, amount, detail) values (u, 'gems', 'quest', q.gems, jsonb_build_object('quest', q.id));
        update public.reward_totals set gems = gems + q.gems where user_id = u;
      end if;
    end if;
  end loop;
  return jsonb_build_object('completed', to_jsonb(done), 'gems', (select gems from public.reward_totals where user_id = u));
end $$;
grant execute on function public.check_quests to authenticated;
```

`supabase/seed.sql` (idempotent `insert ... on conflict (id) do update`):

```sql
insert into public.games (slug, title, url, sort_order, xp_events, daily_xp_cap) values
 ('wordforge','Word Forge','https://wordforge.travelschooling.com',1,'{"word_forged":{"xp":5,"per_day":40},"story_unlocked":{"xp":25,"per_day":5}}',250),
 ('katas','KATAS','https://katas.travelschooling.com',2,'{"kata_step":{"xp":2,"per_day":60},"kata_complete":{"xp":50,"per_day":5},"kata_view":{"xp":5,"per_day":5},"quiz_correct":{"xp":5,"per_day":40},"quiz_perfect":{"xp":50,"per_day":5},"journal_entry":{"xp":15,"per_day":1}}',300),
 ('horizon','Knowledge Horizon','https://horizon.travelschooling.com',3,'{"problem_correct":{"xp":5,"per_day":40},"session_complete":{"xp":30,"per_day":3}}',300),
 ('wordwave','WordWave','https://wordwave.travelschooling.com',4,'{"lesson_complete":{"xp":10,"per_day":20},"review_session":{"xp":10,"per_day":5}}',300)
on conflict (slug) do update set title = excluded.title, url = excluded.url, sort_order = excluded.sort_order, xp_events = excluded.xp_events, daily_xp_cap = excluded.daily_xp_cap;

insert into public.shop_items (id, title, price, effect) values
 ('freeze','Streak freeze',10,'{"streak_freezes":1}'), ('frame-bronze','Bronze avatar frame',25,'{"frame":"bronze"}'), ('frame-silver','Silver avatar frame',60,'{"frame":"silver"}')
on conflict (id) do update set title = excluded.title, price = excluded.price, effect = excluded.effect;

insert into public.quests (id, title, rule, gems) values
 ('daily-30xp','Earn 30 XP today','{"xp_today":30}',5), ('daily-two-games','Play two different games today','{"games_today":2}',10)
on conflict (id) do update set title = excluded.title, rule = excluded.rule, gems = excluded.gems;

-- Achievements: Word Forge 50/200/500 words + stories; KATAS per-kata complete, all five, view milestones 1/5/10/20/50/100 per kata, quiz perfect per kata and all-100, journal 5/20/50; Horizon first mastery; WordWave first lesson, 7-day streak.
insert into public.achievements (id, game, title, description, icon, gems)
select 'wordforge-words-' || n, 'wordforge', n || ' words forged', 'Forge ' || n || ' words', 'hammer', 10 from unnest(array[50,200,500]) n
union all select 'katas-complete-' || k, 'katas', initcap(k) || ' complete', 'Step through ' || initcap(k) || ' end to end', 'belt', 10 from unnest(array['seisan','seiunchin','naihanchi','wansu','chinto']) k
union all select 'katas-complete-all', 'katas', 'All five kata', 'Complete every kata', 'belt', 50
union all select 'katas-views-' || k || '-' || n, 'katas', initcap(k) || ' x' || n, 'View ' || initcap(k) || ' ' || n || ' times', 'eye', case when n >= 50 then 20 else 5 end
  from unnest(array['seisan','seiunchin','naihanchi','wansu','chinto']) k cross join unnest(array[1,5,10,20,50,100]) n
union all select 'katas-quiz-' || k, 'katas', initcap(k) || ' quiz perfect', 'All 20 right', 'brain', 15 from unnest(array['seisan','seiunchin','naihanchi','wansu','chinto']) k
union all select 'katas-quiz-all', 'katas', 'Kata scholar', 'All 100 questions right', 'brain', 60
union all select 'katas-journal-' || n, 'katas', n || ' journal entries', 'Write ' || n || ' practice notes', 'book', 10 from unnest(array[5,20,50]) n
union all select 'horizon-first-mastery', 'horizon', 'First mastery', 'Master your first standard', 'star', 20
union all select 'wordwave-first-lesson', 'wordwave', 'First lesson', 'Finish a lesson', 'wave', 5
union all select 'school-streak-7', null, 'One week streak', 'Seven days in a row', 'fire', 25
on conflict (id) do update set title = excluded.title, description = excluded.description, icon = excluded.icon, gems = excluded.gems;
```

- [ ] **Step 4: Push, seed, run.** `npm run db:push && npm run db:seed && npm run test:integration` → PASS. Wire `check_quests` into the launcher: `(app)/page.tsx` calls `supabase.rpc("check_quests")` before rendering and shows a "Quest complete: +N gems" banner when `completed` is non-empty.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Seed the four games, achievements, shop and daily quests"`

---

## Self-review against the spec

- §3.1 roles: Task 2 enum, Task 5 admin gate, Task 9 step 6 makes Scott admin. ✓
- §3.2 signup incl. enrollment switch, age gate, minor path, social handles, confirm, waiting: Tasks 6, 7, 8, 9. ✓
- §3.3 email limit: Task 6 maths, Task 7 429 both ways, Task 8 messages and resend, reset message in login form. ✓ No approval email anywhere. ✓
- §3.4 approval/reject/revoke with note: Task 9. ✓
- §3.5 cookie domain and flags: Task 3; portal-only refresh: Task 5 proxy; JWKS + claims: Tasks 3, 4. ✓ Claim is named `role_name` (documented in Task 2).
- §3.6 portal enforcement: Task 5. Games' enforcement belongs to Plans 2 to 5 and copies `decideRoute`.
- §4 rewards rules: Task 10 (`award`, caps, streak with freezes, level gems), quests Task 14, shop Task 10/11. Timezone from profile: `user_today()`. ✓
- §5 tables: Tasks 2, 10, 12, 14. `settings.id` is a boolean single-row key rather than the spec's bare row; same intent.
- §6 kit API: Task 12 implements `init`, `user`, `load`, `save`, `award`, `unlock`, `totals`, `journal.save/list`, `launcherUrl`, `toast`. ✓ The spec's `event()` is folded into `award(event, detail)` since every event is an award.
- §7.1 pages: Tasks 8, 9, 11; `/kit/v1/ts-kit.js` Task 12. ✓ Marketplace provisioning Task 0. ✓
- §9 DNS for `class`: Task 13. ✓
- §11 tests: unit for age gate, approval state machine, enrollment, 429, token claims (Tasks 4, 6, 7, 9); SQL rewards tests (Task 10, 14); middleware table test (Task 5); kit offline/queue tests (Task 12); manual under-13 signup (Task 8 step 5, Task 13 step 5). ✓
- Type consistency: `Claims.role` in TS ↔ `role_name` claim in JWT ↔ `profiles.role` enum; `award` return shape identical in SQL `totals_json`, kit `rpc`, and Task 10 tests. `SignupDeps` field names match between Task 7 test and implementation.
