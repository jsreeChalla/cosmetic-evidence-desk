import type { LegalMatter, ResearchPaper } from '~/lib/schemas'
import { LegalMatterCard } from './LegalMatterCard'
import { ResearchPaperCard } from './ResearchPaperCard'
import { sortByRecency } from '~/lib/recency'

export function ReadMoreSection(props: { legalMatters: Array<LegalMatter>; papers: Array<ResearchPaper> }) {
  // Most recent research is shown first (undated sources last).
  const legalMatters = sortByRecency(props.legalMatters)
  const papers = sortByRecency(props.papers)
  if (legalMatters.length === 0 && papers.length === 0) return null

  const count = legalMatters.length + papers.length
  const parts: Array<string> = []
  if (legalMatters.length > 0) parts.push(`${legalMatters.length} legal matter${legalMatters.length > 1 ? 's' : ''}`)
  if (papers.length > 0) parts.push(`${papers.length} paper${papers.length > 1 ? 's' : ''}/rating${papers.length > 1 ? 's' : ''}`)

  return (
    <details className="group overflow-hidden rounded-lg border border-hairline bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-unclear-tint text-sm font-semibold text-status-unclear"
          >
            {count}
          </span>
          <span className="min-w-0 text-base font-medium">
            Sources &amp; references
            <span className="ml-1.5 font-normal text-slate-500">— {parts.join(', ')}</span>
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="space-y-6 border-t border-hairline px-5 py-5">
        {legalMatters.length > 0 && (
          <div>
            <h3 className="mb-3 text-base">
              Legal &amp; regulatory matters <span className="text-sm font-normal text-slate-500">· newest first</span>
            </h3>
            <div className="space-y-3">
              {legalMatters.map((matter, i) => (
                <LegalMatterCard key={i} matter={matter} />
              ))}
            </div>
          </div>
        )}

        {papers.length > 0 && (
          <div>
            <h3 className="mb-3 text-base">
              Research &amp; ratings <span className="text-sm font-normal text-slate-500">· newest first</span>
            </h3>
            <div className="space-y-3">
              {papers.map((paper, i) => (
                <ResearchPaperCard key={i} paper={paper} />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
