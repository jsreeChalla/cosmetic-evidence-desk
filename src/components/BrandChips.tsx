import { useState } from 'react'
import type { BrandCatalogEntry } from '~/lib/igraal-brands'
import { brandLogoUrl } from '~/lib/brand-logo'

function ChipLogo(props: { website?: string }) {
  const [failed, setFailed] = useState(false)
  if (!props.website || failed) return null
  return (
    <img
      src={brandLogoUrl(props.website, 32)}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function BrandChips(props: {
  brands: Array<BrandCatalogEntry>
  selectedId: string | null
  onSelect: (id: string) => void
  layout?: 'row' | 'column'
}) {
  const { brands, selectedId, onSelect, layout = 'row' } = props

  return (
    <div
      className={layout === 'column' ? 'flex flex-col gap-2' : 'flex flex-wrap justify-center gap-2'}
      role="list"
    >
      {brands.map((brand) => {
        const isSelected = brand.id === selectedId
        return (
          <button
            key={brand.id}
            type="button"
            role="listitem"
            aria-pressed={isSelected}
            onClick={() => onSelect(brand.id)}
            className={
              'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none ' +
              (isSelected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-800 hover:border-slate-500')
            }
          >
            <ChipLogo website={brand.website} />
            {brand.name}
          </button>
        )
      })}
    </div>
  )
}
