import type { LegalMatter, LegalStatus } from '~/lib/schemas'

const STATUS_LABEL: Record<LegalStatus, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-status-mixed-tint text-status-mixed' },
  settled: { label: 'Settled', classes: 'bg-status-unclear-tint text-status-unclear' },
  decided: { label: 'Decided', classes: 'bg-status-good-tint text-status-good' },
  unclear: { label: 'Status unclear', classes: 'bg-status-unclear-tint text-status-unclear' },
}

function VerificationBadge(props: { verified: boolean }) {
  return props.verified ? (
    <span className="inline-block rounded-full bg-status-good-tint px-2 py-0.5 text-xs font-medium text-status-good">
      ✓ Verified
    </span>
  ) : (
    <span className="inline-block rounded-full bg-status-mixed-tint px-2 py-0.5 text-xs font-medium text-status-mixed">
      ⚠ Unverified — could not confirm this exact wording in the source
    </span>
  )
}

export function LegalMatterCard(props: { matter: LegalMatter }) {
  const { matter } = props
  const status = STATUS_LABEL[matter.status]

  return (
    <article className="rounded-lg border border-hairline bg-white p-5 shadow-sm">
      <h4 className="text-base font-semibold">{matter.title}</h4>
      <p className="mt-0.5 text-sm text-slate-500">
        {matter.entity}
        {matter.year ? ` · ${matter.year}` : ''}
      </p>

      <span className={'mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ' + status.classes}>
        {status.label}
      </span>

      <p className="prose-body mt-3">{matter.summary}</p>

      <blockquote>“{matter.quote}”</blockquote>
      <VerificationBadge verified={matter.quoteVerification === 'verified'} />

      <div className="mt-3 text-sm">
        <a href={matter.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View source
        </a>
      </div>
    </article>
  )
}
