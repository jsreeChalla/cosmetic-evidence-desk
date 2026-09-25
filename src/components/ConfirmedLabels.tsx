import type { BrandClaim, ClaimCategory } from '~/lib/schemas'

const LABEL_TEXT: Record<ClaimCategory, string> = {
  safety: 'Safe',
  sustainability: 'Sustainable',
  'cruelty-free': 'Cruelty-free',
  vegan: 'Vegan',
  'labour-ethics': 'Ethical',
  quality: 'High quality',
  'material-sourcing': 'Responsible materials',
  'counterfeit-risk': 'Low counterfeit risk',
  'e-waste-recyclability': 'Recyclable',
  'conflict-minerals': 'Responsibly sourced minerals',
  'data-privacy': 'Privacy-respecting',
  'sourcing-organic': 'Responsibly sourced',
  'additives-health': 'Clean additives',
  'animal-welfare': 'Animal welfare',
}

export function ConfirmedLabels(props: { claims: Array<BrandClaim> }) {
  const confirmed = props.claims.filter((c) => c.match === 'confirmed')
  if (confirmed.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Confirmed by independent sources">
      {confirmed.map((c) => (
        <span
          key={c.category}
          className="inline-flex items-center gap-1 rounded-full bg-status-good-tint px-2.5 py-1 text-xs font-medium text-status-good"
        >
          <span aria-hidden="true">✓</span>
          {LABEL_TEXT[c.category]}
        </span>
      ))}
    </div>
  )
}
