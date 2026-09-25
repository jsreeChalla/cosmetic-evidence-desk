import type { Independence, ResearchPaper, Scope, Verdict } from '~/lib/schemas'

const INDEPENDENCE_LABEL: Record<Independence, string> = {
  independent: 'Independent',
  company: 'Company-published',
  unclear: 'Independence unclear',
}

const SCOPE_LABEL: Record<Scope, string> = {
  'brand-specific': 'Brand-specific',
  'parent-company': 'Parent company',
  'sector-wide': 'Sector-wide',
}

const VERDICT_CLASSES: Record<Verdict, string> = {
  good: 'bg-status-good-tint text-status-good',
  concerning: 'bg-status-concerning-tint text-status-concerning',
  mixed: 'bg-status-mixed-tint text-status-mixed',
  unclear: 'bg-status-unclear-tint text-status-unclear',
}

const OTHER_CATEGORY_LABEL: Record<string, string> = {
  'cruelty-free': 'Cruelty-free',
  vegan: 'Vegan',
  'labour-ethics': 'Labour ethics',
  quality: 'Quality',
  'material-sourcing': 'Material sourcing',
  'counterfeit-risk': 'Counterfeit risk',
  'e-waste-recyclability': 'E-waste & recyclability',
  'conflict-minerals': 'Conflict minerals',
  'data-privacy': 'Data privacy',
  'sourcing-organic': 'Ingredient sourcing',
  'additives-health': 'Additives & health',
  'animal-welfare': 'Animal welfare',
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

export function ResearchPaperCard(props: { paper: ResearchPaper }) {
  const { paper } = props

  return (
    <article className="rounded-lg border border-hairline bg-white p-5 shadow-sm">
      <h4 className="text-base font-semibold">{paper.title}</h4>
      <p className="mt-0.5 text-sm text-slate-500">
        {paper.publisher}
        {paper.year ? ` · ${paper.year}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {INDEPENDENCE_LABEL[paper.independence]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {SCOPE_LABEL[paper.scope]}
        </span>
      </div>

      {paper.fundingDisclosure && (
        <p className="mt-2 text-sm text-slate-500">
          <span className="font-medium text-slate-600">Funding: </span>
          {paper.fundingDisclosure}
        </p>
      )}

      <p className="prose-body mt-3">{paper.summary}</p>

      {paper.findings.length > 0 && (
        <ul className="mt-3 space-y-3">
          {paper.findings.map((finding, i) => (
            <li key={i}>
              <p className="text-sm">{finding.text}</p>
              <blockquote>“{finding.quote}”</blockquote>
              <VerificationBadge verified={finding.quoteVerification === 'verified'} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + VERDICT_CLASSES[paper.safetyVerdict]}>
          Safety: {paper.safetyVerdict}
        </span>
        <span
          className={'rounded-full px-2 py-0.5 text-xs font-medium ' + VERDICT_CLASSES[paper.sustainabilityVerdict]}
        >
          Sustainability: {paper.sustainabilityVerdict}
        </span>
        {paper.otherVerdicts?.map((v) => (
          <span key={v.category} className={'rounded-full px-2 py-0.5 text-xs font-medium ' + VERDICT_CLASSES[v.verdict]}>
            {OTHER_CATEGORY_LABEL[v.category] ?? v.category}: {v.verdict}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View source
        </a>
        {paper.pdfUrl && (
          <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
            View PDF / DOI
          </a>
        )}
      </div>
    </article>
  )
}
