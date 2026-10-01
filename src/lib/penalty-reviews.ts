import type { ClaimCategory } from './schemas'

/**
 * Human review gate for the −1 "false claim" penalty.
 *
 * The automatic rules (sustainability-score.ts) decide whether a contradicted
 * claim MEETS the evidence bar, but they judge contradiction per category, not
 * per claim: e.g. LG's narrow data-destruction claim was "contradicted" by
 * articles about data breaches and TV tracking — real privacy concerns that
 * don't show that specific claim is false. So a −1 is only applied after a
 * person has read the claim and the sources and listed it here. Until then the
 * category scores 0 and is shown as "awaiting review".
 *
 * Add an entry only after checking that the cited sources contradict the
 * brand's specific claim (not just the category in general).
 */
export interface PenaltyReview {
  brandId: string
  category: ClaimCategory
  reviewedBy: string
  reviewedOn: string // YYYY-MM-DD
  note: string
}

export const APPROVED_PENALTIES: Array<PenaltyReview> = [
  // { brandId: 'example', category: 'sustainability', reviewedBy: 'Jsree', reviewedOn: '2026-10-01', note: 'Regulator ruling directly contradicts the recyclable-packaging claim.' },
]

export function isPenaltyApproved(brandId: string | undefined, category: ClaimCategory): PenaltyReview | undefined {
  if (!brandId) return undefined
  return APPROVED_PENALTIES.find((r) => r.brandId === brandId && r.category === category)
}
