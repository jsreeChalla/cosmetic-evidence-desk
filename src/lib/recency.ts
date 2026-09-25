import type { BrandStatus, Verdict } from './schemas'

/**
 * Recency weighting: newer research counts for more than older research.
 *
 * Tiers (age = evidence year - publication year):
 *   0-2 years   -> 1.0
 *   3-5 years   -> 0.6
 *   6-10 years  -> 0.3
 *   > 10 years  -> 0.1
 *   undated     -> 0.5  (living pages such as rating sites often carry no year;
 *                        they count, but less than research known to be recent)
 *
 * Tiers (rather than a smooth decay curve) keep the rule easy to explain to
 * shoppers, brands and legal reviewers.
 */
export const UNDATED_WEIGHT = 0.5

export function recencyWeight(year: number | undefined | null, referenceYear: number): number {
  if (typeof year !== 'number' || !Number.isFinite(year)) return UNDATED_WEIGHT
  const age = Math.max(0, referenceYear - year)
  if (age <= 2) return 1
  if (age <= 5) return 0.6
  if (age <= 10) return 0.3
  return 0.1
}

export function recencyLabel(year: number | undefined | null, referenceYear: number): string {
  if (typeof year !== 'number') return 'Undated'
  const age = Math.max(0, referenceYear - year)
  if (age <= 2) return 'Recent'
  if (age <= 5) return `${age} years old`
  return `Older (${year})`
}

const EPSILON = 1e-9

/**
 * Recency-weighted version of the verdict majority vote. Each verdict counts
 * with its source's recency weight instead of 1. When every source has the
 * same weight (e.g. all undated) this gives exactly the same answer as a plain
 * count, including 'mixed' on a real good-vs-concerning tie.
 */
export function weightedAggregateStatus(
  items: Array<{ verdict: Verdict; year?: number | null }>,
  referenceYear: number,
): BrandStatus {
  if (items.length === 0) return 'no-data'
  const totals: Record<Verdict, number> = { good: 0, concerning: 0, mixed: 0, unclear: 0 }
  for (const item of items) totals[item.verdict] += recencyWeight(item.year, referenceYear)
  const ranked = (Object.entries(totals) as Array<[Verdict, number]>).sort((a, b) => b[1] - a[1])
  const [topVerdict, topWeight] = ranked[0]
  const tiedWithTop = ranked.filter(([, w]) => Math.abs(w - topWeight) < EPSILON)
  if (tiedWithTop.length > 1 && totals.good > 0 && totals.concerning > 0) return 'mixed'
  return topVerdict
}

/** Newest first; undated items after dated ones; original order kept otherwise. */
export function sortByRecency<T extends { year?: number | null }>(items: Array<T>): Array<T> {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ya = typeof a.item.year === 'number' ? a.item.year : -Infinity
      const yb = typeof b.item.year === 'number' ? b.item.year : -Infinity
      return yb === ya ? a.index - b.index : yb - ya
    })
    .map(({ item }) => item)
}
