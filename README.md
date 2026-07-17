# MacScott Apps Showcase

One Next.js 16 App Router deployment serves two hostname-isolated sites:

- `scott.macscott.net` — Scott’s yellow/orange XRAI Studio world
- `alexander.macscott.net` — Alexander’s royal/electric-blue game world

The proxy rewrites public URLs to `/t/scott/*` or `/t/alexander/*`, keeping the tenant in Next.js route/cache keys. Do not link to the internal `/t/*` paths.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000/?tenant=scott` or `http://localhost:3000/?tenant=alexander`. The override works only locally and on preview deployments. Test deterministic rendering with `/apps?tier=full`, `/apps?tier=lite`, and `/apps?tier=off`.

```bash
npm test
npm run build
npm run start
```

The production-build cross-host integration test is skipped by the normal suite because it builds and boots a server. Run it explicitly with:

```bash
npm run test:integration
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | Production; optional locally | Fine-grained GitHub PAT with read-only access to public repositories. Used for catalog REST/GraphQL calls. |
| `REVALIDATE_SECRET` | Production | Long random bearer secret shared only with app-repository Actions. Protects revalidation and catalog status. |

`GET /api/catalog-status` and `POST /api/revalidate` require `Authorization: Bearer $REVALIDATE_SECRET`. Revalidation expires the global `catalog` tag and both tenant route trees.

## Add an app

1. In a repository owned by `XRAI-Studio` or `alexandermacscott-del`, add the GitHub topic `macscott-app`.
2. Add `macscott.json` at the repository root:

```json
{
  "schemaVersion": 1,
  "title": "Void Runner",
  "description": "A precise one-line description of the app.",
  "owner": "alexander",
  "liveUrl": "https://your-app.example.com",
  "embeddable": true,
  "screenshot": "screenshots/cover.png",
  "accent": "#4da6ff"
}
```

`owner` must match the publishing account (`scott` for `XRAI-Studio`, `alexander` for `alexandermacscott-del`) or be `both`. A shared app appears on both sites. `liveUrl` must be HTTPS and cannot use either showcase origin. Omit `liveUrl` for an in-development orb. When `liveUrl` exists, `embeddable` defaults to `true`; set it to `false` when the app blocks framing. Screenshot paths are repository-relative and fetched at the same pinned commit SHA as the manifest.

3. Optionally add `.github/workflows/macscott-revalidate.yml` for seconds-fast refresh (store the bearer value as repository secret `MACSCOTT_REVALIDATE_SECRET`):

```yaml
name: Refresh MacScott
on: [push]
jobs:
  revalidate:
    runs-on: ubuntu-latest
    steps:
      - run: curl --fail -X POST -H "Authorization: Bearer ${{ secrets.MACSCOTT_REVALIDATE_SECRET }}" https://scott.macscott.net/api/revalidate
```

Without the Action, the shared catalog refreshes on its one-hour cache cycle. Invalid manifests exclude only their repository and produce a structured rejection log; transient GitHub failures preserve the last good catalog.

## Blog and tenant copy

Add validated Markdown posts under `content/blog/scott/` or `content/blog/alexander/` with `title`, `date` (`YYYY-MM-DD`), and `description` frontmatter. Raw HTML and unsafe link schemes are not rendered. Edit landing copy, palettes, and placeholder social URLs in `content/tenants/scott.ts` and `content/tenants/alexander.ts`. Placeholder links are visibly labeled in the UI.

## DNS and Vercel

1. Import `XRAI-Studio/macscott-sites` as one Vercel project.
2. Add both domains in **Project → Settings → Domains**: `scott.macscott.net` and `alexander.macscott.net`.
3. At the DNS provider for `macscott.net`, create:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `scott` | `cname.vercel-dns.com` |
| CNAME | `alexander` | `cname.vercel-dns.com` |

If Vercel shows a project-specific target instead, use the exact target Vercel supplies. Production `*.vercel.app` aliases redirect permanently to the appropriate custom domain; preview deployments render `noindex` with production canonical metadata. Unknown hosts redirect to Scott’s canonical domain.

## Deployment checks

- Confirm `/`, `/blog`, `/rss.xml`, `/robots.txt`, and `/sitemap.xml` differ correctly under both Host headers.
- Confirm the `next build` output keeps three.js/R3F out of the landing route graph.
- Exercise all tier overrides, keyboard navigation, Escape/Back from an app, and simulated WebGL context loss.
- Verify embedded apps retain the always-visible external-open control and the response includes `Content-Security-Policy: frame-ancestors 'none'`.
