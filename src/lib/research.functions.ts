import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ALL_RETAILER_BRANDS } from './igraal-brands'
import { isFresh, readBrandCache, writeBrandCache } from './brand-cache.server'
import type { BrandAnalysis } from './schemas'

// Secrets are only ever read inside this server-function handler, never
// exported, never sent to the client bundle (PRD section 9).
const requestSchema = z.object({
  brandId: z.string().min(1),
})

export type BrandResearchResponse =
  | { status: 'ok'; data: BrandAnalysis }
  | { status: 'unknown-brand'; brandId: string }
  | { status: 'config-error'; message: string }
  | { status: 'error'; message: string }

export const getBrandResearch = createServerFn({ method: 'GET' })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }): Promise<BrandResearchResponse> => {
    const brand = ALL_RETAILER_BRANDS.find((b) => b.id === data.brandId)
    if (!brand) {
      return { status: 'unknown-brand', brandId: data.brandId }
    }

    const cached = await readBrandCache(brand.id)
    if (cached && isFresh(cached.cachedAt)) {
      return { status: 'ok', data: cached.data }
    }

    // Either a direct Console API key (ANTHROPIC_API_KEY) or an internal
    // Anthropic-compatible gateway credential (ANTHROPIC_BASE_URL +
    // ANTHROPIC_AUTH_TOKEN) is sufficient — see research.server.ts.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      if (cached) return { status: 'ok', data: cached.data } // serve stale over a hard config error
      return {
        status: 'config-error',
        message:
          'Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set on the server. Add one to your .env file (see .env.example) to enable live evidence retrieval.',
      }
    }

    try {
      // Imported dynamically so the retrieval/AI code (and its dependency on
      // ANTHROPIC_API_KEY) never gets pulled into any client-facing bundle.
      const { researchBrand } = await import('./research.server')
      const data_ = await researchBrand(brand)
      // A degraded run with no evidence (whether from a total retrieval
      // failure like DuckDuckGo's anti-bot burst response, or sources being
      // fetched but extraction running out of time/failing) is more likely a
      // transient infra hiccup than a genuine "no evidence exists" result.
      // Caching it would lock the brand into a false failure for the full
      // 90-day TTL, silently breaking "Try again" until it expires — so only
      // cache a no-evidence result when the run wasn't degraded at all.
      if (data_.hasEvidence || !data_.degraded) {
        await writeBrandCache(brand.id, data_).catch(() => {}) // best-effort — never let a cache-write failure break the response
      }
      return { status: 'ok', data: data_ }
    } catch (err) {
      // A stale cache entry beats a hard failure — this is exactly the case
      // the cache exists for (e.g. the live pipeline is degraded/rate-limited
      // this run, but we have something recent to fall back to).
      if (cached) return { status: 'ok', data: cached.data }
      // PRD 7.4: search/parse failure must produce an explicit retry
      // message, never fabricated content.
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Evidence retrieval failed unexpectedly.',
      }
    }
  })
