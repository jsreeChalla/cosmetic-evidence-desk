export function ExplanationSection(props: { overview: string }) {
  if (props.overview.trim() === '') return null

  return (
    <section className="rounded-r-lg border-l-4 border-brand bg-fill p-4 sm:p-5">
      <h3 className="mt-0 mb-2 text-sm font-semibold text-ink-secondary">What the evidence shows</h3>
      <p className="prose-body max-w-prose">{props.overview}</p>
    </section>
  )
}
