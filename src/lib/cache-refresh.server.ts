import { ALL_RETAILER_BRANDS, type BrandCatalogEntry } from './igraal-brands'
import {
  CACHE_MAX_AGE_MS,
  isFresh,
  listBrandCache,
  readBrandCache,
  readRefreshState,
  writeBrandCache,
  writeRefreshState,
  type RefreshState,
} from './brand-cache.server'
import type { BrandAnalysis } from './schemas'

/**
 * Cache refresh, shared by the Vercel Cron route
 * (src/routes/api/cron/refresh-cache.ts) and scripts/refresh-brand-cache.mjs.
 *
 * The whole catalogue is refreshed in ONE SWEEP EVERY 90 DAYS (SWEEP_INTERVAL_MS),
 * not as a rolling daily batch. The scheduler may call runSweep() as often as
 * it likes (e.g. a daily cron): outside a sweep, a call only reads one small
 * state record and returns "not-due" — no searches, no AI calls, no credits.
 *
 * When a sweep is due it starts, and every call then refreshes the next batch
 * of brands (oldest cache first) until every brand has been attempted once;
 * progress is saved after each brand, so an interrupted sweep resumes where it
 * stopped. The local script uses an unlimited batch, so it finishes a sweep in
 * one run; the Vercel route is limited per call by the 300s function limit.
 *
 * Firecrawl is only used while the account actually has credits (checked
 * before each brand); otherwise research goes straight to DuckDuckGo.
 */

export const SWEEP_INTERVAL_MS = CACHE_MAX_AGE_MS // 90 days

// Roughly what one brand costs (8-9 searches × 4 scraped pages, measured ~100).
const FIRECRAWL_CREDITS_PER_BRAND = 100

export interface RefreshResult {
  brandId: string
  outcome: 'written' | 'kept-existing' | 'failed'
  seconds: number
  detail: string
}

export interface SweepReport {
  status: 'not-due' | 'started' | 'in-progress' | 'completed'
  message: string
  results: Array<RefreshResult>
  remaining: number
  sweepStartedAt?: string
  nextSweepAt?: string
}

// ---------------------------------------------------------------------------
// Firecrawl credit check
// ---------------------------------------------------------------------------

let creditCheck: { at: number; remaining: number | null } | undefined

/** Remaining Firecrawl credits, or null when unknown (no key / API error). Cached 5 min. */
export async function firecrawlRemainingCredits(): Promise<number | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (!apiKey) return null
  if (creditCheck && Date.now() - creditCheck.at < 5 * 60_000) return creditCheck.remaining
  let remaining: number | null = null
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { success?: boolean; data?: { remainingCredits?: number } }
    if (json.success && typeof json.data?.remainingCredits === 'number') remaining = json.data.remainingCredits
  } catch {
    remaining = null
  }
  creditCheck = { at: Date.now(), remaining }
  return remaining
}

async function shouldUseFirecrawl(): Promise<boolean> {
  if (process.env.REFRESH_USE_FIRECRAWL?.trim().toLowerCase() === 'false') return false
  const remaining = await firecrawlRemainingCredits()
  return remaining !== null && remaining >= FIRECRAWL_CREDITS_PER_BRAND
}

// ---------------------------------------------------------------------------
// Refreshing individual brands
// ---------------------------------------------------------------------------

function independentCount(data: BrandAnalysis | undefined): number {
  return (data?.papers ?? []).filter((p) => p.independence === 'independent').length
}

// Never replace a cache entry that has evidence with a weaker result (e.g. an
// empty DuckDuckGo pass).
function isWeaker(next: BrandAnalysis, existing: BrandAnalysis | undefined): boolean {
  if (!existing?.hasEvidence) return false
  if (!next.hasEvidence) return true
  return next.degraded && independentCount(next) === 0 && independentCount(existing) > 0
}

export async function refreshBrand(brand: BrandCatalogEntry): Promise<RefreshResult> {
  const startedAt = Date.now()
  const secs = () => Math.round((Date.now() - startedAt) / 100) / 10
  try {
    const allowFirecrawl = await shouldUseFirecrawl()
    // Imported lazily so the heavy AI/retrieval code only loads when needed.
    const { researchBrand } = await import('./research.server')
    const data = await researchBrand(brand, { allowFirecrawl })
    const existing = (await readBrandCache(brand.id))?.data
    const via = allowFirecrawl ? 'firecrawl' : 'duckduckgo'
    const summary = `via=${via} hasEvidence=${data.hasEvidence} papers=${data.papers.length} independent=${independentCount(data)} claims=${data.claims.length} degraded=${data.degraded}`
    if (isWeaker(data, existing)) {
      return { brandId: brand.id, outcome: 'kept-existing', seconds: secs(), detail: `new result was weaker (${summary}); existing cache kept` }
    }
    await writeBrandCache(brand.id, data)
    return { brandId: brand.id, outcome: 'written', seconds: secs(), detail: summary }
  } catch (err) {
    return { brandId: brand.id, outcome: 'failed', seconds: secs(), detail: err instanceof Error ? err.message : String(err) }
  }
}

async function runPool(
  brands: Array<BrandCatalogEntry>,
  concurrency: number,
  onDone: (r: RefreshResult) => Promise<void> = async () => {},
): Promise<Array<RefreshResult>> {
  const results: Array<RefreshResult> = []
  let next = 0
  async function worker() {
    while (next < brands.length) {
      const result = await refreshBrand(brands[next++])
      results.push(result)
      await onDone(result)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, brands.length)) }, worker))
  return results
}

/** Refresh specific brands right now, outside the sweep schedule (manual use). */
export async function refreshBrands(brands: Array<BrandCatalogEntry>, concurrency = 2): Promise<Array<RefreshResult>> {
  return runPool(brands, concurrency)
}

/** Brands with a missing or >90-day-old cache entry, oldest first (or every brand with force). */
export async function selectBrandsToRefresh(opts: { batchSize: number; force?: boolean; brandIds?: Array<string> }): Promise<Array<BrandCatalogEntry>> {
  if (opts.brandIds && opts.brandIds.length > 0) {
    const wanted = new Set(opts.brandIds)
    return ALL_RETAILER_BRANDS.filter((b) => wanted.has(b.id))
  }
  const cachedAt = new Map((await listBrandCache()).map((e) => [e.brandId, e.cachedAt]))
  const due = ALL_RETAILER_BRANDS.filter((b) => {
    const at = cachedAt.get(b.id)
    return opts.force || !at || !isFresh(at)
  })
  due.sort((a, b) => new Date(cachedAt.get(a.id) ?? 0).getTime() - new Date(cachedAt.get(b.id) ?? 0).getTime())
  return due.slice(0, opts.batchSize)
}

// ---------------------------------------------------------------------------
// 90-day sweep
// ---------------------------------------------------------------------------

function addInterval(iso: string): string {
  return new Date(new Date(iso).getTime() + SWEEP_INTERVAL_MS).toISOString()
}

/**
 * First run with no saved state: treat the oldest existing cache entry as the
 * start of the "last sweep", so a freshly built/migrated cache isn't
 * immediately re-scraped. If any brand has never been cached, a sweep is due now.
 */
async function bootstrapState(cachedAt: Map<string, string>): Promise<RefreshState> {
  const allCached = ALL_RETAILER_BRANDS.every((b) => cachedAt.has(b.id))
  if (!allCached || cachedAt.size === 0) return {}
  const oldest = [...cachedAt.values()].sort()[0]
  return { lastSweepStartedAt: oldest, lastSweepCompletedAt: oldest }
}

export async function getSweepStatus(): Promise<{ state: RefreshState; nextSweepAt?: string }> {
  const state = await readRefreshState()
  return { state, nextSweepAt: state.lastSweepStartedAt ? addInterval(state.lastSweepStartedAt) : undefined }
}

export async function runSweep(opts: { maxBrands?: number; concurrency?: number; force?: boolean } = {}): Promise<SweepReport> {
  const maxBrands = opts.maxBrands && opts.maxBrands > 0 ? opts.maxBrands : Infinity
  const concurrency = opts.concurrency ?? 2
  const now = new Date().toISOString()
  const cachedAt = new Map((await listBrandCache()).map((e) => [e.brandId, e.cachedAt]))

  let state = await readRefreshState()
  if (!state.lastSweepStartedAt && !state.activeSweepStartedAt) {
    state = await bootstrapState(cachedAt)
    if (state.lastSweepStartedAt) await writeRefreshState(state)
  }

  let status: SweepReport['status'] = 'in-progress'
  if (!state.activeSweepStartedAt) {
    const nextSweepAt = state.lastSweepStartedAt ? addInterval(state.lastSweepStartedAt) : undefined
    if (!opts.force && nextSweepAt && nextSweepAt > now) {
      return {
        status: 'not-due',
        message: `Next full refresh is due ${nextSweepAt.slice(0, 10)} (every 90 days).`,
        results: [],
        remaining: 0,
        nextSweepAt,
      }
    }
    state = { ...state, activeSweepStartedAt: now, lastSweepStartedAt: now, attemptedBrandIds: [] }
    await writeRefreshState(state)
    status = 'started'
  }

  const attempted = new Set(state.attemptedBrandIds ?? [])
  const pending = ALL_RETAILER_BRANDS.filter((b) => !attempted.has(b.id)).sort(
    (a, b) => new Date(cachedAt.get(a.id) ?? 0).getTime() - new Date(cachedAt.get(b.id) ?? 0).getTime(),
  )
  const batch = pending.slice(0, maxBrands === Infinity ? pending.length : maxBrands)

  const results = await runPool(batch, concurrency, async (r) => {
    attempted.add(r.brandId)
    state = { ...state, attemptedBrandIds: [...attempted] }
    await writeRefreshState(state) // resume point if the run is interrupted
  })

  const remaining = ALL_RETAILER_BRANDS.filter((b) => !attempted.has(b.id)).length
  if (remaining === 0) {
    const completedAt = new Date().toISOString()
    state = { lastSweepStartedAt: state.activeSweepStartedAt, lastSweepCompletedAt: completedAt }
    await writeRefreshState(state)
    const nextSweepAt = addInterval(state.lastSweepStartedAt!)
    return {
      status: 'completed',
      message: `Full refresh finished. Next one is due ${nextSweepAt.slice(0, 10)}.`,
      results,
      remaining: 0,
      sweepStartedAt: state.lastSweepStartedAt,
      nextSweepAt,
    }
  }

  return {
    status,
    message: `Full refresh in progress: ${results.length} brand(s) done this run, ${remaining} still to go.`,
    results,
    remaining,
    sweepStartedAt: state.activeSweepStartedAt,
  }
}
