import { useState } from 'react'
import type { BrandCatalogEntry } from '~/lib/igraal-brands'
import type { ClaimCategory } from '~/lib/schemas'
import { brandLogoUrl } from '~/lib/brand-logo'

const CATEGORY_STYLE: Record<ClaimCategory, { icon: string; tint: string; fg: string }> = {
  safety: { icon: '🛡️', tint: 'bg-status-good-tint', fg: 'text-status-good' },
  sustainability: { icon: '🌱', tint: 'bg-cat-sustainability-tint', fg: 'text-cat-sustainability' },
  vegan: { icon: '🌿', tint: 'bg-cat-vegan-tint', fg: 'text-cat-vegan' },
  'cruelty-free': { icon: '🐰', tint: 'bg-cat-cruelty-free-tint', fg: 'text-cat-cruelty-free' },
  'labour-ethics': { icon: '🤝', tint: 'bg-cat-ethical-tint', fg: 'text-cat-ethical' },
  quality: { icon: '⭐', tint: 'bg-cat-quality-tint', fg: 'text-cat-quality' },
  'material-sourcing': { icon: '🧵', tint: 'bg-cat-material-sourcing-tint', fg: 'text-cat-material-sourcing' },
  'counterfeit-risk': { icon: '🔍', tint: 'bg-cat-counterfeit-risk-tint', fg: 'text-cat-counterfeit-risk' },
  'e-waste-recyclability': { icon: '♻️', tint: 'bg-cat-e-waste-recyclability-tint', fg: 'text-cat-e-waste-recyclability' },
  'conflict-minerals': { icon: '⛏️', tint: 'bg-cat-conflict-minerals-tint', fg: 'text-cat-conflict-minerals' },
  'data-privacy': { icon: '🔒', tint: 'bg-cat-data-privacy-tint', fg: 'text-cat-data-privacy' },
  'sourcing-organic': { icon: '🌾', tint: 'bg-cat-sourcing-organic-tint', fg: 'text-cat-sourcing-organic' },
  'additives-health': { icon: '🧪', tint: 'bg-cat-additives-health-tint', fg: 'text-cat-additives-health' },
  'animal-welfare': { icon: '🐄', tint: 'bg-cat-animal-welfare-tint', fg: 'text-cat-animal-welfare' },
}

function BannerBrandChip(props: { brand: BrandCatalogEntry; onSelect: (id: string) => void }) {
  const { brand } = props
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <button
      type="button"
      onClick={() => props.onSelect(brand.id)}
      className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-white focus-visible:outline-none"
    >
      {brand.website && !logoFailed && (
        <img
          src={brandLogoUrl(brand.website, 32)}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 shrink-0 rounded-sm object-contain"
          onError={() => setLogoFailed(true)}
        />
      )}
      {brand.name}
    </button>
  )
}

export function CategoryBanner(props: {
  category: ClaimCategory
  title: string
  description: string
  brands: Array<BrandCatalogEntry>
  onSelect: (id: string) => void
}) {
  const { title, description, brands, onSelect, category } = props
  if (brands.length === 0) return null

  const style = CATEGORY_STYLE[category]

  return (
    <section
      aria-label={title}
      className={'rounded-2xl px-5 py-5 sm:px-7 sm:py-6 ' + style.tint}
    >
      <div className="flex items-start gap-3 sm:items-center">
        <span aria-hidden="true" className="text-2xl leading-none">
          {style.icon}
        </span>
        <div className="min-w-0">
          <h2 className={'text-lg font-semibold uppercase tracking-wide sm:text-xl ' + style.fg}>{title}</h2>
          <p className="mt-0.5 text-sm text-ink/70">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {brands.map((brand) => (
          <BannerBrandChip key={brand.id} brand={brand} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}
