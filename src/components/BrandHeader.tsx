import { useState } from 'react'
import type { BrandCatalogEntry } from '~/lib/igraal-brands'
import { brandLogoUrl } from '~/lib/brand-logo'
import type { BrandClaim } from '~/lib/schemas'
import { ConfirmedLabels } from './ConfirmedLabels'

export function BrandHeader(props: { brand: BrandCatalogEntry; parentCompany?: string; claims?: Array<BrandClaim> }) {
  const { brand } = props
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <div className="flex items-center gap-3">
      {brand.website && !logoFailed && (
        <img
          src={brandLogoUrl(brand.website, 64)}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-md border border-hairline bg-surface object-contain p-1.5"
          onError={() => setLogoFailed(true)}
        />
      )}
      <div>
        <h2 className="text-2xl">{brand.name}</h2>
        {props.claims && (
          <div className="mt-1.5">
            <ConfirmedLabels claims={props.claims} />
          </div>
        )}
        {props.parentCompany && <p className="mt-1.5 text-sm text-ink-secondary">Subsidiary of {props.parentCompany}</p>}
        {brand.website && (
          <a
            href={`https://${brand.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-area mt-0.5 inline-block text-sm text-ink-secondary underline decoration-hairline-strong underline-offset-2 hover:text-ink"
          >
            {brand.website} ↗
          </a>
        )}
      </div>
    </div>
  )
}
