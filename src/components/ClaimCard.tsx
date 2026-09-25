import type { BrandClaim, ClaimCategory } from '~/lib/schemas'

// Aligned to the semantic status tokens in styles.css (--color-status-*) so
// every verdict in the app — this card, paper badges, legal-matter status —
// reads from the same calm, editorial palette instead of default Tailwind
// candy colors.
const MATCH_STATUS: Record<BrandClaim['match'], { icon: string; label: string; tint: string; fg: string }> = {
  confirmed: { icon: '✓', label: 'Confirmed by independent sources', tint: 'bg-status-good-tint', fg: 'text-status-good' },
  contradicted: { icon: '✕', label: 'Contradicted by independent sources', tint: 'bg-status-concerning-tint', fg: 'text-status-concerning' },
  inconclusive: { icon: '–', label: 'Checked by independent sources — no clear finding', tint: 'bg-status-mixed-tint', fg: 'text-status-mixed' },
  'no-data': { icon: '–', label: 'No independent information available', tint: 'bg-status-unclear-tint', fg: 'text-status-unclear' },
}

const NO_CLAIM = { icon: '–', label: 'No public claim found', tint: 'bg-status-unclear-tint', fg: 'text-status-unclear' }

function SourceList({ sources }: { sources: Array<{ publisher: string; sourceUrl: string }> }) {
  return (
    <>
      {sources.map((s, i) => (
        <span key={s.sourceUrl}>
          {i > 0 && ', '}
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600"
          >
            {s.publisher}
          </a>
        </span>
      ))}
    </>
  )
}

export function ClaimCard(props: { label: string; category: ClaimCategory; claim?: BrandClaim }) {
  const { claim } = props
  const status = claim ? MATCH_STATUS[claim.match] : NO_CLAIM

  return (
    <div className="rounded-lg border border-hairline bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-semibold ' + status.tint + ' ' + status.fg}
        >
          {status.icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink/55">{props.label}</h3>
          <p className={'text-xs font-medium ' + status.fg}>{status.label}</p>
        </div>
      </div>

      <div className="mt-3">
        {claim ? (
          claim.claim ? (
            <>
              <p className="prose-body text-sm">{claim.claim}</p>
              <blockquote className="mt-1 text-xs text-slate-500">
                “{claim.quote}”
                {claim.sourceUrl && (
                  <>
                    {' '}
                    <a
                      href={claim.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 underline hover:text-slate-600"
                    >
                      source ↗
                    </a>
                  </>
                )}
              </blockquote>
              {claim.match === 'inconclusive' && claim.checkedBy && claim.checkedBy.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Checked by <SourceList sources={claim.checkedBy} /> — no conclusive finding either way.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                No public claim was found for {props.label.toLowerCase()}, but independent sources have looked into it directly.
              </p>
              {claim.checkedBy && claim.checkedBy.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Source{claim.checkedBy.length > 1 ? 's' : ''}: <SourceList sources={claim.checkedBy} />
                </p>
              )}
            </>
          )
        ) : (
          <p className="text-sm text-slate-400">This brand does not make a public claim about {props.label.toLowerCase()}.</p>
        )}
      </div>
    </div>
  )
}
