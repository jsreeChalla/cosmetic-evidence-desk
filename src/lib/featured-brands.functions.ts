import { createServerFn } from '@tanstack/react-start'
import { ALL_RETAILER_BRANDS, type BrandCatalogEntry } from './igraal-brands'
import { listBrandCache } from './brand-cache.server'
import { ClaimCategorySchema, type ClaimCategory } from './schemas'

// The homepage groups brands into "sustainable / vegan / cruelty-free /
// ethical / high quality" showcase rows. This reads ONLY the existing cache
// (never triggers live research — that costs Firecrawl credits and takes
// 60-120s/brand) and only ever includes a brand whose claim for that
// category resolved to 'confirmed' — the same bar ConfirmedLabels uses on a
// brand's own page. A brand with no cache entry, or an unconfirmed/no-data
// category, is simply absent from that row rather than shown as a guess.
const FEATURED_CATEGORIES: Array<{ key: ClaimCategory; label: string }> = [
  { key: 'sustainability', label: 'Sustainable' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'cruelty-free', label: 'Cruelty-free' },
  { key: 'labour-ethics', label: 'Ethical' },
  { key: 'quality', label: 'High quality' },
]

export type FeaturedBrandGroups = Record<ClaimCategory, Array<BrandCatalogEntry>>

export interface FeaturedBrandsResponse {
  groups: FeaturedBrandGroups
  checkedCount: number
  totalCount: number
}

export const getFeaturedBrands = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FeaturedBrandsResponse> => {
    // Record<ClaimCategory, ...> must have every enum key initialized even
    // though only FEATURED_CATEGORIES' rows ever render on the homepage.
    const groups = Object.fromEntries(
      ClaimCategorySchema.options.map((category) => [category, [] as Array<BrandCatalogEntry>]),
    ) as FeaturedBrandGroups

    let checkedCount = 0

    // One bulk read (a single database query) instead of one lookup per brand.
    const cacheById = new Map((await listBrandCache()).map((e) => [e.brandId, e]))

    for (const brand of ALL_RETAILER_BRANDS) {
      const cached = cacheById.get(brand.id)
      if (!cached) continue
      checkedCount++

      for (const { key } of FEATURED_CATEGORIES) {
        const claim = cached.data.claims.find((c) => c.category === key)
        if (claim?.match === 'confirmed') groups[key].push(brand)
      }
    }

    return { groups, checkedCount, totalCount: ALL_RETAILER_BRANDS.length }
  },
)
