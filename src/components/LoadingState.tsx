function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-hairline bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-20 rounded bg-slate-200" />
          <div className="mt-2 h-2.5 w-32 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-2.5 w-full rounded bg-slate-100" />
        <div className="h-2.5 w-5/6 rounded bg-slate-100" />
        <div className="h-2.5 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  )
}

export function LoadingState(props: { brandName: string }) {
  return (
    <div>
      <p aria-live="polite" className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" aria-hidden="true" />
        Gathering independent evidence for {props.brandName}… this can take up to a minute.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
