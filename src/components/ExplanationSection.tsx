export function ExplanationSection(props: { overview: string }) {
  if (props.overview.trim() === '') return null

  return (
    <section className="rounded-r-lg border-l-4 border-ink bg-hairline/25 p-4 sm:p-5">
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink/60">What the evidence shows</h3>
      <p className="prose-body max-w-prose">{props.overview}</p>
    </section>
  )
}
