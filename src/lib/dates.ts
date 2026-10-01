/**
 * Display helpers for when a source was published. Shared by server and client.
 *
 * Dates come only from the source page's own metadata (see
 * source-dates.server.ts) or from a year stated in the source text — never
 * guessed. A page can state when it was first published, when it was last
 * updated (typical for living rating pages), or both.
 */

export interface DatedSource {
  publishedDate?: string // YYYY-MM-DD (or YYYY-MM / YYYY)
  updatedDate?: string // last updated, when the page states it
  year?: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  if (!m) return String(y)
  if (!d) return `${MONTHS[m - 1]} ${y}`
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "Published 12 Mar 2024 · updated 3 Jun 2025" · "Updated 3 Jun 2025" · "Published 2024" · "Date not stated" */
export function sourceDateLabel(s: DatedSource): string {
  const upd = s.updatedDate && s.updatedDate !== s.publishedDate ? s.updatedDate : undefined
  if (s.publishedDate) return `Published ${formatDay(s.publishedDate)}${upd ? ` · updated ${formatDay(upd)}` : ''}`
  if (upd) return `Updated ${formatDay(upd)}`
  if (s.year) return `Published ${s.year}`
  return 'Date not stated'
}

/** Short form for inline citations: "12 Mar 2024" · "12 Mar 2024, updated 3 Jun 2025" · "updated 3 Jun 2025" · "2024" · "undated" */
export function sourceDateShort(s: DatedSource): string {
  const upd = s.updatedDate && s.updatedDate !== s.publishedDate ? s.updatedDate : undefined
  if (s.publishedDate) return `${formatDay(s.publishedDate)}${upd ? `, updated ${formatDay(upd)}` : ''}`
  if (upd) return `updated ${formatDay(upd)}`
  if (s.year) return String(s.year)
  return 'undated'
}

/** The most recent stated date's year — what recency weighting should use. */
export function latestYear(s: DatedSource): number | undefined {
  const d = [s.updatedDate, s.publishedDate].filter(Boolean).sort().pop()
  return d ? Number(d.slice(0, 4)) : s.year
}
