import { useId, useState } from 'react'
import type { SustainabilityScore } from '~/lib/sustainability-score'
import type { ClaimCategory } from '~/lib/schemas'

const LABELS: Partial<Record<ClaimCategory, string>> = {
  safety: 'Safety',
  sustainability: 'Sustainability',
  'cruelty-free': 'Cruelty-free',
  quality: 'Product quality',
  'labour-ethics': 'Labour & ethics',
}

export const SCRAPED_NOTICE =
  'This information was collected automatically by scraping publicly available sources on the internet and summarised with AI. It may be incomplete, out of date or contain errors, and is not an official certification.'

function Star(props: { fill: number }) {
  // fill: 0, 0.5, or 1
  return (
    <span className="relative inline-block h-4 w-4 shrink-0" aria-hidden="true">
      <span className="absolute inset-0 text-slate-200">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-amber-500"
        style={{ width: `${props.fill * 100}%` }}
      >
        ★
      </span>
    </span>
  )
}

function formatPoints(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${Math.abs(points)}`
  return '0'
}

export function SustainabilityScoreBadge(props: { score: SustainabilityScore }) {
  const { score } = props
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const stars = Array.from({ length: score.maxScore }, (_, i) => {
    const remaining = score.score - i
    return Math.max(0, Math.min(1, remaining))
  })

  return (
    <div className="rounded-lg border border-hairline bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-ink/55">Sustainability score</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-sm font-medium text-ink hover:bg-hairline/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {open ? 'Hide score' : 'Show score'}
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5" role="img" aria-label={`${score.score} out of ${score.maxScore} stars`}>
              {stars.map((fill, i) => (
                <Star key={i} fill={fill} />
              ))}
            </div>
            <span className="text-sm font-medium text-ink/80">
              {score.score.toFixed(1)} / {score.maxScore}
            </span>
            {score.penaltiesApplied > 0 && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                {score.penaltiesApplied} false-claim penalt{score.penaltiesApplied === 1 ? 'y' : 'ies'}
              </span>
            )}
          </div>

          <ul className="divide-y divide-hairline text-sm">
            {score.breakdown.map((b) => (
              <li key={b.category} className="flex gap-3 py-2">
                <span
                  className={`w-10 shrink-0 text-right font-mono tabular-nums ${
                    b.points < 0 ? 'text-rose-700' : b.points === 0 ? 'text-ink/50' : 'text-ink/80'
                  }`}
                >
                  {formatPoints(b.points)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{LABELS[b.category] ?? b.category}</span>
                  <span className="text-ink/70"> — {b.reason}</span>
                  {b.note && <span className="mt-0.5 block text-xs text-ink/50">{b.note}</span>}
                </span>
              </li>
            ))}
          </ul>

          {score.overrideReason && <p className="text-xs text-rose-700">{score.overrideReason}</p>}
          {score.rawScore < 0 && (
            <p className="text-xs text-ink/50">
              Category points add up to {score.rawScore.toFixed(1)}; the score is shown as 0 because it never goes below zero.
            </p>
          )}

          <p className="text-xs text-ink/50">
            A −1 is given only when the brand made a verified public claim that recent independent evidence contradicts —
            from two separate sources, an authoritative body (regulator, court, government agency), or a source plus a
            decided ruling — and no equally recent independent source supports the claim.
          </p>
          <p className="text-xs text-ink/50">
            Newer research is prioritised: sources from the last 2 years count fully, 3–5 years 0.6×, 6–10 years 0.3×,
            older 0.1×, and undated sources 0.5×.
          </p>
          <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{SCRAPED_NOTICE}</p>
        </div>
      )}
    </div>
  )
}
