# Deploying Evidence Desk to Vercel + MongoDB Atlas (free)

The app runs on Vercel. The brand evidence cache lives in a **free MongoDB
Atlas cluster (M0)**, created and connected through Vercel's MongoDB Atlas
integration. A daily **Vercel Cron** call runs the 90-day refresh sweep.

```
Browser ──► Vercel function (fra1) ──► MongoDB Atlas M0 (AWS eu-central-1)
                    │                     db "reliability-check": brand_cache, refresh_state
                    └─► Anthropic gateway, Firecrawl, DuckDuckGo
Vercel Cron 03:00 UTC ─► /api/cron/refresh-cache  (full sweep every 90 days; 2 brands per run during a sweep)
```

Run all commands in Terminal from the `cosmetics-evidence-desk` folder.

## 1. Install and link the Vercel project

```bash
npm install
npx vercel login
npx vercel link        # creates the Vercel project
```

## 2. Add the free MongoDB database (via Vercel)

1. Vercel dashboard → your project → **Storage** → **Create Database** →
   **MongoDB Atlas** (Marketplace).
2. Choose the **Free** plan (M0), provider **AWS**, region **Frankfurt
   (eu-central-1)** so it sits next to the app's `fra1` functions.
3. Connect it to this project for **Production, Preview and Development**.

This creates the Atlas account/cluster, adds `MONGODB_URI` to the project's
environment variables, and opens the Atlas network access list to all IPs
(`0.0.0.0/0`), which Vercel needs because its IP addresses change. Access is
still protected by the database username/password inside `MONGODB_URI`.

Free-tier limits that matter here: 512 MB storage (we use ~1.3 MB), 100
operations/second, 500 connections, no automatic backups, and the cluster
pauses after 30 days with zero connections (the daily cron keeps it active).

## 3. Add the other environment variables

Vercel → Settings → Environment Variables (Production + Preview):

| Name | Value | Notes |
|---|---|---|
| `MONGODB_URI` | *(already set by step 2)* | turns on the MongoDB backend |
| `MONGODB_DB` | `reliability-check` | optional, this is the default |
| `CRON_SECRET` | output of `openssl rand -hex 32` | protects the cron endpoint |
| `REFRESH_BATCH_SIZE` | `2` | brands per cron run during a sweep (max 4) |
| `REFRESH_USE_FIRECRAWL` | `true` | `false` = never use Firecrawl; otherwise only while credits remain |
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL` | as in your `.env` | mark the token **Sensitive** |
| `FIRECRAWL_API_KEY` | as in `.env` | Sensitive |
| `CLAUDE_WEB_TOOLS_BLOCKED` | `true` | |

`.env` and `.env.local` are never uploaded (see `.vercelignore`) or committed.

## 4. Copy the existing cache into MongoDB (once)

```bash
npx vercel env pull .env.local          # brings MONGODB_URI down to your Mac
set -a && source .env && source .env.local && set +a
npm run refresh-cache:build
node scripts/migrate-cache-to-db.mjs --dry-run
node scripts/migrate-cache-to-db.mjs
```

It should end with `Database now holds 65 brand(s)`. Each brand keeps its
original `cachedAt`, and the 90-day sweep schedule (`data/refresh-state.json`)
is copied too. Re-running is safe.

## 5. Deploy

```bash
npx vercel --prod
```

(Or `git init`, push to GitHub, and import the repo in Vercel for automatic
deploys on every push.) The Nitro plugin in `vite.config.ts` pins functions to
**fra1** with a 300 s max duration and registers the daily cron.

## 6. Verify

- Open the site, pick a brand: it should load instantly from MongoDB.
- Sweep status / manual refresh (same auth Vercel uses):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-domain>/api/cron/refresh-cache?status=1"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-domain>/api/cron/refresh-cache?brand=nike"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-domain>/api/cron/refresh-cache?force=1"   # start a full sweep now
```

- Vercel → Settings → Cron Jobs shows `/api/cron/refresh-cache` at `0 3 * * *`.
- Atlas UI → Browse Collections → `reliability-check.brand_cache` shows 65 documents.
- Logs: search `[cron-refresh]` in Vercel runtime logs.

## Operating notes

- **Refresh schedule — one full sweep every 90 days.** The cron fires daily,
  but outside a sweep it only reads the `refresh_state` document and returns
  `not-due` — no searches, AI calls or credits. When 90 days have passed since
  the last sweep started, each run refreshes the next 2 brands (oldest first)
  until all 65 are done; progress is saved per brand. On Hobby (1 run/day) a
  sweep takes ~33 days; on Pro, an hourly schedule finishes it in ~1.5 days.
  The local script (`node scripts/refresh-brand-cache.mjs`) follows the same
  schedule and finishes a due sweep in one run. First sweep due **1 Dec 2026**.
- **Firecrawl:** ~100 credits per brand, 1,000/month on the plan → ~10 brands
  per sweep; the rest use DuckDuckGo. A weaker result never overwrites a
  better cached one.
- **Backups:** the free tier has none. Keep `data/brand-cache/` as a seed copy,
  or export occasionally with MongoDB Database Tools:
  `mongodump --uri "$MONGODB_URI" --db reliability-check`.
- **Anthropic gateway token:** if `ANTHROPIC_AUTH_TOKEN` is a personal,
  short-lived token (minted at llm-auth.atolls.net), refreshes and uncached
  lookups fail once it expires. Get a service token for production.
- **Preview deployments** use the same database as production unless you
  connect a separate Atlas database to the Preview environment.
- **Local dev without a database:** leave `MONGODB_URI` empty and the app uses
  `data/brand-cache/*.json`.
