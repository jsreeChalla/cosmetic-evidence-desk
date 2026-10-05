import { feedbackUrl } from '~/lib/feedback'

/** "Give feedback" card linking to the Google Form; renders nothing until a form URL is set in lib/feedback.ts. */
export function FeedbackCard(props: { brandName?: string }) {
  const href = feedbackUrl(props.brandName)
  if (!href) return null
  return (
    <aside
      aria-label="Feedback"
      className="flex flex-col items-start gap-3 rounded-lg border border-hairline bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium text-ink">This is an early prototype — what do you think?</p>
        <p className="text-sm text-slate-500">
          {props.brandName
            ? `Spotted something wrong about ${props.brandName}, or have an idea? It takes about 2 minutes.`
            : 'Tell me what works, what doesn’t, and what you’d change. It takes about 2 minutes.'}
        </p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white! no-underline hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        Give feedback ↗
      </a>
    </aside>
  )
}
