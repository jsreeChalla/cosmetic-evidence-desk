import { isOnCommunity, type BrandCatalogEntry } from './igraal-brands'

/**
 * Where a brand result's "See current deals" button points.
 *
 * - Brands on the community site (Dealabs, France — matching this catalogue's
 *   fr.igraal.com source) link to Dealabs' search for that brand.
 * - iGraal-only brands link to their iGraal store page (`storeUrl`).
 *
 * No deal data is copied or stored here; each site stays the source of truth.
 */
export const COMMUNITY_SITE = {
  name: 'Dealabs',
  searchUrl: 'https://www.dealabs.com/search',
} as const

// `searchName` is tuned for evidence research (e.g. "ghd (Good Hair Day)"),
// which is too long for a deals search, so only use it where it's still the
// name shoppers would type.
const DEALS_QUERY_OVERRIDES: Record<string, string> = {
  kiko: 'KIKO Milano',
}

export function brandDealsLink(brand: BrandCatalogEntry): { site: 'Dealabs' | 'iGraal'; url: string } {
  if (isOnCommunity(brand)) {
    const query = DEALS_QUERY_OVERRIDES[brand.id] ?? brand.name
    return { site: 'Dealabs', url: `${COMMUNITY_SITE.searchUrl}?q=${encodeURIComponent(query)}` }
  }
  return { site: 'iGraal', url: brand.storeUrl }
}

/**
 * Design mockup showing how brand evidence could appear on Dealabs itself
 * (deal-card evidence strip + "Brand evidence" filter), as a static image in
 * public/. Linked from every brand page as an example. The editable source is
 * the "Dealabs evidence badge mockup" design on claude.ai; re-export the PNG
 * after changing it.
 */
export const DEALABS_MOCKUP_URL = '/dealabs-mockup.png'
