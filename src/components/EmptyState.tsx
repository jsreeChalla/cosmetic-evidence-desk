export function EmptyState(props: {
  brandName: string
  reason: 'no-data' | 'error' | 'config-error'
  message?: string
  onRetry?: () => void
}) {
  const { brandName, reason, message, onRetry } = props

  if (reason === 'no-data') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-hairline bg-white p-6">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-unclear-tint text-base font-semibold text-status-unclear"
        >
          –
        </span>
        <p className="prose-body text-slate-700">
          No independent research, regulatory findings or published data are available for {brandName} yet.
        </p>
      </div>
    )
  }

  if (reason === 'config-error') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-status-mixed/30 bg-status-mixed-tint p-6">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-status-mixed">
          !
        </span>
        <p className="prose-body text-status-mixed">
          {message ?? 'The server is not configured to fetch evidence right now.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-status-mixed/30 bg-status-mixed-tint p-6">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-status-mixed">
        !
      </span>
      <div className="min-w-0">
        <p className="prose-body text-status-mixed">Something went wrong while gathering evidence for {brandName}.</p>
        {message && <p className="mt-1 text-sm text-status-mixed/80">{message}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md border border-status-mixed/40 bg-white px-3 py-1.5 text-sm font-medium text-status-mixed hover:bg-status-mixed-tint focus-visible:outline-none"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
