import type { BrandCatalogEntry } from '~/lib/igraal-brands'
import { brandDealsLink, DEALABS_MOCKUP_URL } from '~/lib/community-deals'

/** "See current deals for <brand>" button: Dealabs for community brands, iGraal for iGraal-only brands. */
export function CommunityDealsLink(props: { brand: BrandCatalogEntry }) {
  const { brand } = props
  const { site, url } = brandDealsLink(brand)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-event="deals-click"
      data-deals-site={site}
      data-brand-id={brand.id}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand! no-underline transition-colors hover:bg-brand-hover active:bg-brand-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      See current deals for {brand.name} on {site} ↗
    </a>
  )
}

/** Small link to the Dealabs design mockup (how evidence could look on the community site). */
export function DealabsMockupLink() {
  return (
    <p className="text-sm text-ink-secondary">
      Prototype idea:{' '}
      <a
        href={DEALABS_MOCKUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-event="mockup-click"
        className="tap-area font-semibold text-link underline decoration-hairline-strong hover:text-ink"
      >
        see how brand evidence could look on Dealabs (mockup) ↗
      </a>
    </p>
  )
}
