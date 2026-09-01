# Per-app revalidation

The showcase catalog is cached and refreshes on its own about once an hour. That is
fine for a description tweak, but it means a newly published app, a new `liveUrl`, or
a fixed manifest can sit invisible for up to an hour.

This wires each app repo to refresh the catalog the moment it publishes.

## How it works

`macscott-sites` exposes a reusable workflow,
[`.github/workflows/revalidate-showcase.yml`](../.github/workflows/revalidate-showcase.yml),
which POSTs to `https://scott.macscott.net/api/revalidate` with a bearer token. That
endpoint calls `revalidateTag("catalog", "max")`, so one call refreshes **both** sites —
Alexander's repos do not need a different URL.

`macscott-sites` is a public repo, so app repos under either account
(`XRAI-Studio` and `alexandermacscott-del`) can call it.

## Setup, per app repo

### 1. Give the repo the secret

The value is the same `REVALIDATE_SECRET` set in the Vercel project — your local copy is
in the gitignored `.env.revalidate-secret.local`.

```bash
gh secret set MACSCOTT_REVALIDATE_SECRET --repo XRAI-Studio/<repo> --body '<secret>'
```

For the `XRAI-Studio` org you can set it once for every repo instead:

```bash
gh secret set MACSCOTT_REVALIDATE_SECRET --org XRAI-Studio --visibility all --body '<secret>'
```

Alexander's account is a user, not an org, so his repos each need the repo-level secret.

### 2. Add the caller workflow

Commit this to the app repo as `.github/workflows/revalidate-showcase.yml`:

```yaml
name: Refresh MacScott showcase

on:
  push:
    # The catalog only ever reads the default branch, so nothing else matters.
    branches: [main]
    paths:
      - macscott.json
  # A Pages deploy changes what the orb actually opens, so refresh after one too.
  workflow_run:
    workflows: ["pages-build-deployment"]
    types: [completed]
  workflow_dispatch:

jobs:
  revalidate:
    uses: XRAI-Studio/macscott-sites/.github/workflows/revalidate-showcase.yml@main
    with:
      reason: ${{ github.repository }}
    secrets:
      REVALIDATE_SECRET: ${{ secrets.MACSCOTT_REVALIDATE_SECRET }}
```

Drop the `workflow_run` trigger for repos that do not deploy through GitHub Pages, and
change `branches:` if the repo's default branch is not `main`.

## Verifying

After the workflow runs, confirm the app is actually in the catalog:

```bash
curl -s https://scott.macscott.net/api/catalog-status \
  -H "Authorization: Bearer <secret>" | jq '{count: (.apps | length), rejected: .diagnostics.rejected}'
```

`diagnostics.rejected[]` gives a structured reason for any repo that was excluded —
usually a missing `macscott-app` topic, an `owner` that does not match the account, or a
`macscott.json` that fails the strict schema.

## Notes

- The reusable workflow cancels a superseded run (`concurrency`), so several pushes
  landing together trigger one refresh, not several.
- It retries twice on a transient failure but fails fast on `401`, which means the
  repo's secret no longer matches the deployed one.
- Revalidation is a cache refresh, not a deploy. If an app looks stale *after* a
  successful run, the problem is the app's own data (topic, manifest, `liveUrl`), not
  the cache — check `catalog-status`.
