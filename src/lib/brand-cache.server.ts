import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MongoClient, type Collection } from 'mongodb'
import { attachDatabasePool } from '@vercel/functions'
import type { BrandAnalysis } from './schemas'

/**
 * Brand evidence cache. One record per brand: { brandId, cachedAt, data }.
 *
 * Two interchangeable backends, chosen by environment:
 *
 * - **MongoDB** (production / Vercel) — used whenever MONGODB_URI is set
 *   (the MongoDB Atlas Vercel integration sets it automatically). Database
 *   MONGODB_DB (default "reliability-check"):
 *     - `brand_cache`   one document per brand, `_id` = brandId
 *     - `refresh_state` one document, `_id` = "sweep" (see cache-refresh.server.ts)
 *   The client is created once per function instance and registered with
 *   Vercel's attachDatabasePool so idle connections are released cleanly.
 *
 * - **Flat files** (local dev fallback) — data/brand-cache/<id>.json and
 *   data/refresh-state.json, used when MONGODB_URI is not set, so the app
 *   still runs with no database.
 *
 * Either way, the committed data/brand-cache/*.json files are also bundled
 * into the server build as seed data (see "Bundled seed data" below), so a
 * deployment always has the 65 cached brands even before any migration.
 *
 * Populated lazily by getBrandResearch on a miss/staleness, by the Vercel Cron
 * route (src/routes/api/cron/refresh-cache.ts) and by
 * scripts/refresh-brand-cache.mjs, which all go through this module.
 */

const CACHE_DIR = join(process.cwd(), 'data', 'brand-cache')
const STATE_FILE = join(process.cwd(), 'data', 'refresh-state.json')
export const CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days — evidence is static text, and Firecrawl scrapes cost real credits

export interface BrandCacheEntry {
  cachedAt: string
  data: BrandAnalysis
}

export interface BrandCacheListing extends BrandCacheEntry {
  brandId: string
}

// Refresh-sweep state (see cache-refresh.server.ts).
export interface RefreshState {
  // Set while a sweep is in progress; cleared when it finishes.
  activeSweepStartedAt?: string
  // Brands already attempted in the active sweep (written, kept or failed).
  attemptedBrandIds?: Array<string>
  lastSweepStartedAt?: string
  lastSweepCompletedAt?: string
}

interface BrandCacheDoc {
  _id: string // brandId
  cachedAt: string
  data: BrandAnalysis
  updatedAt: string
}

interface RefreshStateDoc {
  _id: 'sweep'
  state: RefreshState
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Bundled seed data
// ---------------------------------------------------------------------------
// data/brand-cache/*.json is compiled INTO the server bundle, because a Vercel
// function can't read files from the repo at runtime. The seed is the fallback
// whenever the store has no entry for a brand (empty/unmigrated database, no
// database at all, or a read error), and a seeded brand is copied into MongoDB
// the first time it's requested so later refreshes update it there.
// Standalone scripts bundled with esbuild (no import.meta.glob) read the
// files from disk instead, so the seed is simply empty there.

let SEED: Map<string, BrandCacheEntry> | undefined

function seedEntries(): Map<string, BrandCacheEntry> {
  if (SEED) return SEED
  SEED = new Map()
  try {
    const modules = import.meta.glob<BrandCacheEntry>('../../data/brand-cache/*.json', { eager: true, import: 'default' })
    for (const [path, entry] of Object.entries(modules)) {
      const brandId = path.split('/').pop()!.replace(/\.json$/, '')
      if (entry?.cachedAt && entry?.data) SEED.set(brandId, entry)
    }
  } catch {
    // Not built by Vite (e.g. esbuild-bundled scripts) — no bundled seed.
  }
  return SEED
}

// ---------------------------------------------------------------------------
// Backend selection / connection
// ---------------------------------------------------------------------------

export function cacheBackend(): 'mongodb' | 'file' {
  return process.env.MONGODB_URI?.trim() ? 'mongodb' : 'file'
}

let clientPromise: Promise<MongoClient> | undefined

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI!.trim(), {
      appName: 'reliability-check',
      // Optional fields in BrandAnalysis are often `undefined`; store them as absent, not null.
      ignoreUndefined: true,
      maxPoolSize: 10, // Atlas free tier allows 500 connections in total
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
    })
    attachDatabasePool(client) // no-op outside Vercel
    clientPromise = client.connect().catch((err) => {
      clientPromise = undefined // allow a retry on the next request
      throw err
    })
  }
  return clientPromise
}

async function collection<T extends { _id: string }>(name: string): Promise<Collection<T>> {
  const db = (await getClient()).db(process.env.MONGODB_DB?.trim() || 'reliability-check')
  return db.collection<T>(name)
}

const brands = () => collection<BrandCacheDoc>('brand_cache')
const stateColl = () => collection<RefreshStateDoc>('refresh_state')

/** Close the database connection so standalone scripts can exit. */
export async function closeCacheStore(): Promise<void> {
  if (!clientPromise) return
  const client = await clientPromise.catch(() => undefined)
  clientPromise = undefined
  await client?.close()
}

// ---------------------------------------------------------------------------
// Brand entries
// ---------------------------------------------------------------------------

export async function readBrandCache(brandId: string): Promise<BrandCacheEntry | undefined> {
  if (cacheBackend() === 'mongodb') {
    try {
      const doc = await (await brands()).findOne({ _id: brandId })
      if (doc) return { cachedAt: doc.cachedAt, data: doc.data }
    } catch (err) {
      console.error(`[brand-cache] mongodb read failed brand=${brandId}`, err)
      return seedEntries().get(brandId) // serve the bundled copy rather than failing the page
    }
    const seeded = seedEntries().get(brandId)
    if (seeded) {
      // First request for this brand on an empty database: copy the seed in.
      await writeBrandCache(brandId, seeded.data, seeded.cachedAt).catch((err) =>
        console.error(`[brand-cache] seeding mongodb failed brand=${brandId}`, err),
      )
    }
    return seeded
  }
  try {
    const raw = await readFile(join(CACHE_DIR, `${brandId}.json`), 'utf-8')
    return JSON.parse(raw) as BrandCacheEntry
  } catch {
    return seedEntries().get(brandId) // e.g. on Vercel, where data/ isn't on disk
  }
}

export async function writeBrandCache(brandId: string, data: BrandAnalysis, cachedAt: string = new Date().toISOString()): Promise<void> {
  if (cacheBackend() === 'mongodb') {
    await (await brands()).replaceOne(
      { _id: brandId },
      { cachedAt, data, updatedAt: new Date().toISOString() },
      { upsert: true },
    )
    return
  }
  const entry: BrandCacheEntry = { cachedAt, data }
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(join(CACHE_DIR, `${brandId}.json`), JSON.stringify(entry, null, 2), 'utf-8')
}

/** Every cached brand in one query (the collection is small: ~65 docs, ~1.3 MB). */
export async function listBrandCache(): Promise<Array<BrandCacheListing>> {
  if (cacheBackend() === 'mongodb') {
    let fromDb: Array<BrandCacheListing> = []
    try {
      const docs = await (await brands()).find({}).toArray()
      fromDb = docs.map((d) => ({ brandId: d._id, cachedAt: d.cachedAt, data: d.data }))
    } catch (err) {
      console.error('[brand-cache] mongodb list failed', err)
    }
    return withSeedFallback(fromDb)
  }
  let files: Array<string> = []
  try {
    files = (await readdir(CACHE_DIR)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const entries = await Promise.all(
    files.map(async (f) => {
      const brandId = f.slice(0, -'.json'.length)
      const entry = await readBrandCache(brandId)
      return entry ? { brandId, ...entry } : undefined
    }),
  )
  return withSeedFallback(entries.filter((e): e is BrandCacheListing => !!e))
}

// Adds bundled seed entries for any brand the store doesn't have yet.
function withSeedFallback(entries: Array<BrandCacheListing>): Array<BrandCacheListing> {
  const have = new Set(entries.map((e) => e.brandId))
  const extra = [...seedEntries()].filter(([id]) => !have.has(id)).map(([brandId, e]) => ({ brandId, ...e }))
  return extra.length ? [...entries, ...extra] : entries
}

// ---------------------------------------------------------------------------
// Refresh-sweep state
// ---------------------------------------------------------------------------

export async function readRefreshState(): Promise<RefreshState> {
  if (cacheBackend() === 'mongodb') {
    const doc = await (await stateColl()).findOne({ _id: 'sweep' })
    return doc?.state ?? {}
  }
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8')) as RefreshState
  } catch {
    return {}
  }
}

export async function writeRefreshState(state: RefreshState): Promise<void> {
  if (cacheBackend() === 'mongodb') {
    await (await stateColl()).replaceOne({ _id: 'sweep' }, { state, updatedAt: new Date().toISOString() }, { upsert: true })
    return
  }
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
}

export function isFresh(cachedAt: string, maxAgeMs: number = CACHE_MAX_AGE_MS): boolean {
  return Date.now() - new Date(cachedAt).getTime() < maxAgeMs
}
