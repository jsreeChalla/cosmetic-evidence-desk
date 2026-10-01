export function Hero(props: { checkedCount: number; independentCount: number; totalCount: number }) {
  return (
    <section className="rounded-2xl bg-accent-tint px-6 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-serif tracking-tight sm:text-4xl">
          Know what's actually behind the brands you buy from
        </h1>
        <p className="prose-body mx-auto mt-3 text-base text-ink/75">
          Look up any brand or retailer from the iGraal France directory and see what
          independently published research, ratings and legal records actually say about its
          safety, sustainability, labour practices and more — every claim quoted and
          source-checked, never guessed.
        </p>
        {props.checkedCount > 0 && (
          <p className="mt-4 text-sm text-slate-500">
            {props.checkedCount} brands researched · {props.independentCount} with independent evidence
            {props.checkedCount > props.independentCount && (
              <span className="block text-xs text-slate-400">
                For the other {props.checkedCount - props.independentCount}, no independently published source has
                been found yet.
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
