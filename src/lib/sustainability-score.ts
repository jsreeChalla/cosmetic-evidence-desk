import { VERTICAL_CATEGORIES, type BrandAnalysis, type BrandClaim, type ClaimCategory, type LegalMatter, type ResearchPaper, type Vertical } from './schemas'
import { sortByRecency } from './recency'

/**
 * A brand's overall sustainability score, out of 5. Built from the same
 * per-category evidence already computed in research.server.ts (BrandClaim.match),
 * so it never invents a judgement beyond what the claim cards already show —
 * it just weighs the five categories into a single number.
 *
 * 'vegan' is deliberately excluded — it's a product-line label (does this
 * brand offer vegan-formulated products), not a measure of how ethical or
 * sustainable the brand itself is, so it stays a claim card without feeding
 * the score.
 *
 * Each category is worth 1 point:
 *   confirmed                                    -> 1
 *   inconclusive / no-data                       -> 0.5 (no independent evidence either way)
 *   contradicted, brand made NO claim of its own -> 0   (independent concern, but no false claim)
 *   contradicted, brand DID claim it             -> 0   unless the strict penalty bar below is met
 *   contradicted claim that meets the strict bar -> -1  (greenwashing penalty)
 *
 * Strict -1 ("false claim") penalty — ALL of these must hold, otherwise the
 * category falls back to 0 with a note saying which test it failed:
 *   1. The brand itself made a public claim for this category, and the quote
 *      of that claim was verified verbatim against the company's own page.
 *   2. Independent evidence contradicts it, from EITHER
 *        a) >= 2 qualifying independent sources on different websites, OR
 *        b) 1 qualifying source published by an authoritative body
 *           (regulator, court, government agency, UN/ILO...), OR
 *        c) 1 qualifying source + 1 qualifying decided legal/regulatory ruling.
 *      A "qualifying" source is independent, rates this category
 *      "concerning", has at least one verified verbatim quote, and carries a
 *      publication year within PENALTY_RECENCY_YEARS of the evidence date.
 *      A qualifying ruling is 'decided' (not pending, not a settlement), has a
 *      verified quote, is recent, is about this category, and does not read as
 *      dismissed/acquitted.
 *   3. No independent source at least as recent as the newest contradicting
 *      source rates this category "good". Disputed evidence is never
 *      penalised, but newer research takes priority: older support that has
 *      been superseded by newer contradicting findings does not block it.
 *   Category matches themselves are recency-weighted (see recency.ts), so
 *   newer research outweighs older research everywhere in the score.
 * The displayed total is floored at 0, so the score stays on a 0-5 scale.
 *
 * Exception: a brand that is cruelty-free everywhere except where animal
 * testing is legally required to sell in mainland China is an industry-standard,
 * narrowly-scoped compromise, not a general disregard for animal welfare — that
 * costs only half a point (0.5) on cruelty-free instead of the full point.
 *
 * Override: labour rights / ethical conduct is treated as a gate, not just
 * one of five equally-weighted categories — independent sources confirming a
 * labour or ethics violation (forced/child labour, unsafe conditions,
 * union-busting, etc.) cap the WHOLE score at 1.5/5, however well the brand
 * scores everywhere else. A brand can't buy back "ethical" with good
 * packaging — 1.5 is what "otherwise flawless, but violates labour/ethics
 * standards" is worth. If the other categories are already weak, the
 * uncapped total (which can only be lower) still applies.
 *
 * Pending legal matters: an unresolved lawsuit alleging labour/ethics
 * violations is NOT a confirmed violation — the charges haven't been proven —
 * so it does not trigger the whole-score gate above. But it's also not
 * nothing, so it zeroes out just the labour-ethics category's own point
 * (rather than the 0.5 "no data either way" a silent category would get) and
 * surfaces as a Note rather than a verdict.
 */

/**
 * Categories that count towards the score are the brand's own vertical's
 * categories (VERTICAL_CATEGORIES) — the same ones shown as cards — minus the
 * ones that are product-line labels rather than a measure of the brand
 * (vegan). So an electronics brand is scored on e-waste, conflict minerals and
 * data privacy, never on cruelty-free.
 *
 *   cosmetics:   safety, sustainability, labour-ethics, cruelty-free, quality
 *   fashion:     safety, sustainability, labour-ethics, material-sourcing, counterfeit-risk
 *   electronics: safety, sustainability, labour-ethics, e-waste-recyclability, conflict-minerals, data-privacy
 *   food:        safety, sustainability, labour-ethics, sourcing-organic, additives-health, animal-welfare
 *
 * Verticals have 5 or 6 categories, so the total is scaled to a 0-5 scale
 * (DISPLAY_MAX) to keep scores comparable across verticals.
 */
const NOT_SCORED: ReadonlySet<ClaimCategory> = new Set<ClaimCategory>(['vegan'])
const DISPLAY_MAX = 5

export function scoredCategoriesFor(vertical: Vertical = 'cosmetics'): Array<ClaimCategory> {
  return (VERTICAL_CATEGORIES[vertical] ?? VERTICAL_CATEGORIES.cosmetics).filter((c) => !NOT_SCORED.has(c))
}

export interface SustainabilityScoreBreakdown {
  category: ClaimCategory
  points: number
  // True when the strict -1 false-claim penalty was applied to this category.
  penalty?: boolean
  reason: string
  // An unresolved, unproven caveat on this category's score (e.g. pending
  // litigation) — distinct from `reason`, which explains a settled verdict.
  note?: string
}

export interface SustainabilityScore {
  score: number
  maxScore: number
  breakdown: Array<SustainabilityScoreBreakdown>
  // Set when the labour-ethics gate capped the category breakdown's total.
  overrideReason?: string
  // Sum of category points before flooring/scaling/capping (can be negative).
  rawScore: number
  // Number of categories scored for this brand's vertical (5 or 6).
  categoryCount: number
  // Number of categories that received the -1 penalty.
  penaltiesApplied: number
}

const LABOUR_VIOLATION_SCORE_CAP = 1.5

function textFieldsFor(claim: BrandClaim | undefined, papers: Array<ResearchPaper>): Array<string> {
  const fields: Array<string> = []
  if (claim?.claim) fields.push(claim.claim)
  if (claim?.quote) fields.push(claim.quote)
  for (const paper of papers) {
    fields.push(paper.summary)
    for (const finding of paper.findings) {
      fields.push(finding.text, finding.quote)
    }
  }
  return fields.map((s) => s.toLowerCase())
}

// Narrow, evidence-gated: only fires when the brand's cruelty-free claim was
// contradicted AND the same evidence explicitly ties the animal testing to
// the China market — never inferred from category alone.
function isChinaOnlyAnimalTestingException(
  category: ClaimCategory,
  claim: BrandClaim | undefined,
  papers: Array<ResearchPaper>,
): boolean {
  if (category !== 'cruelty-free') return false
  if (!claim || claim.match !== 'contradicted') return false

  const haystacks = textFieldsFor(claim, papers)
  const mentionsChina = haystacks.some((s) => s.includes('china'))
  const mentionsAnimalTesting = haystacks.some((s) => s.includes('anim') && s.includes('test'))
  return mentionsChina && mentionsAnimalTesting
}

const ETHICS_LEGAL_KEYWORDS = [
  'labor',
  'labour',
  'worker',
  'wage',
  'child labor',
  'child labour',
  'forced labor',
  'forced labour',
  'discrimination',
  'harassment',
  'union',
  'human rights',
  'supply chain',
  'factory condition',
  'sweatshop',
  'exploitation',
  'modern slavery',
  'working condition',
]

// A matter naming this brand is only relevant to the ethics score if its
// text actually discusses labour/ethics topics — a pending trademark dispute
// or a pending tax case shouldn't zero out this category.
function findPendingEthicsLegalMatter(legalMatters: Array<LegalMatter>): LegalMatter | undefined {
  return legalMatters.find((matter) => {
    if (matter.status !== 'pending') return false
    const haystack = `${matter.title} ${matter.summary} ${matter.quote}`.toLowerCase()
    return ETHICS_LEGAL_KEYWORDS.some((keyword) => haystack.includes(keyword))
  })
}

// ---------------------------------------------------------------------------
// Strict -1 penalty rules
// ---------------------------------------------------------------------------

const PENALTY_POINTS = -1
const PENALTY_RECENCY_YEARS = 5
const MIN_INDEPENDENT_SOURCES_FOR_PENALTY = 2

// Publishers whose finding alone is authoritative enough for the penalty.
const AUTHORITATIVE_PUBLISHER_PATTERNS: Array<RegExp> = [
  /\bcourt\b/i,
  /\btribunal\b/i,
  /\bcour\b/i,
  /\bconseil d'?[ée]tat\b/i,
  /\bcommission\b/i,
  /\bauthorit(y|ies)\b/i,
  /\bautorit[ée]\b/i,
  /\bministry\b/i,
  /\bminist[èe]re\b/i,
  /\bagency\b/i,
  /\bagence\b/i,
  /\bregulator(y)?\b/i,
  /\bDGCCRF\b/,
  /\bANSES\b/,
  /\bANSM\b/,
  /\bECHA\b/,
  /\bSafety Gate\b/i,
  /\bRAPEX\b/,
  /\bCMA\b/,
  /\bFTC\b/,
  /\bFederal Trade Commission\b/i,
  /\bAdvertising Standards\b/i,
  /\bARPP\b/,
  /\bombudsman\b/i,
  /\bInternational Labou?r Organi[sz]ation\b/i,
  /\bILO\b/,
  /\bUnited Nations\b/i,
  /\bOECD\b/,
  /\bNational Contact Point\b/i,
  /\bEuropean Parliament\b/i,
  /\bgovernment\b/i,
  /\bgouvernement\b/i,
]

// Topic keywords a legal ruling must mention to count for a given category.
const CATEGORY_LEGAL_KEYWORDS: Partial<Record<ClaimCategory, Array<string>>> = {
  'labour-ethics': ETHICS_LEGAL_KEYWORDS,
  sustainability: ['greenwash', 'environment', 'écolog', 'recycl', 'carbon', 'climate', 'plastic', 'packaging', 'pollution', 'eco-friendly', 'misleading green', 'sustainab', 'durable'],
  safety: ['safety', 'recall', 'toxic', 'harmful', 'banned substance', 'prohibited substance', 'allergen', 'contaminat', 'carcinogen', 'injur', 'sécurité', 'rappel'],
  'cruelty-free': ['animal test', 'animal-test', 'tested on animals', 'cruelty', 'animal welfare', 'expérimentation animale'],
  quality: ['counterfeit', 'defect', 'quality', 'misleading', 'false advertising', 'deceptive', 'efficacy', 'trompeuse'],
  'material-sourcing': ['cotton', 'leather', 'wool', 'xinjiang', 'deforestation', 'material', 'sourcing', 'recycled polyester'],
  'counterfeit-risk': ['counterfeit', 'fake', 'contrefaçon', 'trademark', 'knock-off'],
  'e-waste-recyclability': ['e-waste', 'weee', 'deee', 'recycl', 'repairab', 'planned obsolescence', 'obsolescence programmée', 'take-back'],
  'conflict-minerals': ['conflict mineral', 'cobalt', 'tantalum', 'tin', 'tungsten', 'coltan', '3tg', 'drc', 'congo'],
  'data-privacy': ['gdpr', 'rgpd', 'cnil', 'data protection', 'privacy', 'personal data', 'données personnelles', 'data breach'],
  'sourcing-organic': ['organic', 'biologique', 'bio ', 'pesticide', 'origin', 'sourcing', 'deforestation'],
  'additives-health': ['additive', 'additif', 'e171', 'nitrite', 'sugar', 'salt', 'nutri-score', 'contaminat', 'recall'],
  'animal-welfare': ['animal welfare', 'bien-être animal', 'cage', 'battery', 'slaughter', 'l214', 'livestock'],
}

const DISMISSAL_PATTERN = /\b(dismiss(ed|al)|acquit(ted)?|cleared|overturned|rejected the (claim|complaint)|in favou?r of (the )?(company|brand)|relaxe|débouté)\b/i

function verdictFor(paper: ResearchPaper, category: ClaimCategory): string | undefined {
  if (category === 'safety') return paper.safetyVerdict
  if (category === 'sustainability') return paper.sustainabilityVerdict
  return paper.otherVerdicts?.find((v) => v.category === category)?.verdict
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function isRecent(year: number | undefined, referenceYear: number): boolean {
  if (typeof year !== 'number') return false // undated evidence can't trigger a penalty
  return referenceYear - year <= PENALTY_RECENCY_YEARS && year <= referenceYear + 1
}

function isAuthoritativePublisher(publisher: string): boolean {
  return AUTHORITATIVE_PUBLISHER_PATTERNS.some((re) => re.test(publisher))
}

interface PenaltyAssessment {
  applies: boolean
  // Why it applied, or which rule it failed.
  explanation: string
  sources: Array<{ publisher: string; sourceUrl: string }>
}

export function assessFalseClaimPenalty(
  category: ClaimCategory,
  claim: BrandClaim | undefined,
  papers: Array<ResearchPaper>,
  legalMatters: Array<LegalMatter>,
  referenceYear: number,
): PenaltyAssessment {
  const none = (explanation: string): PenaltyAssessment => ({ applies: false, explanation, sources: [] })

  if (!claim || claim.match !== 'contradicted') return none('Not contradicted.')

  // Rule 1: the brand must itself have made a verified public claim.
  if (!claim.claim || !claim.quote) {
    return none('The brand made no public claim of its own here, so there is no false claim to penalise.')
  }
  if (claim.quoteVerification !== 'verified') {
    return none("The brand's own claim could not be verified word-for-word against its website.")
  }

  const independent = papers.filter((p) => p.independence === 'independent' && p.scope !== 'sector-wide')

  const qualifying = sortByRecency(
    independent.filter(
      (p) =>
        verdictFor(p, category) === 'concerning' &&
        isRecent(p.year, referenceYear) &&
        p.findings.some((f) => f.quoteVerification === 'verified'),
    ),
  )

  // Rule 3: disputed evidence is never penalised — but newer research takes
  // priority. A recent source supporting the claim only blocks the penalty if
  // it is at least as new as the newest contradicting source; older support
  // has been superseded by the newer findings.
  const newestContradiction = qualifying.length > 0 ? (qualifying[0].year as number) : -Infinity
  const supersedingSupport = independent.filter(
    (p) =>
      verdictFor(p, category) === 'good' &&
      isRecent(p.year, referenceYear) &&
      (p.year as number) >= newestContradiction,
  )
  if (supersedingSupport.length > 0) {
    return none('Independent sources disagree: a source at least as recent as the contradicting evidence supports the claim.')
  }

  // Distinct websites, so one outlet syndicated twice doesn't count double.
  const byHost = new Map<string, ResearchPaper>()
  for (const p of qualifying) if (!byHost.has(hostOf(p.sourceUrl))) byHost.set(hostOf(p.sourceUrl), p)
  const distinct = [...byHost.values()]
  const attribution = distinct.map((p) => ({ publisher: p.publisher, sourceUrl: p.sourceUrl }))

  const keywords = CATEGORY_LEGAL_KEYWORDS[category] ?? []
  const rulings = legalMatters.filter((m) => {
    if (m.status !== 'decided') return false
    if (m.quoteVerification !== 'verified') return false
    if (!isRecent(m.year, referenceYear)) return false
    const text = `${m.title} ${m.summary} ${m.quote}`
    if (DISMISSAL_PATTERN.test(text)) return false
    const lower = text.toLowerCase()
    return keywords.some((k) => lower.includes(k))
  })

  // Rule 2a: two or more independent sources.
  if (distinct.length >= MIN_INDEPENDENT_SOURCES_FOR_PENALTY) {
    return {
      applies: true,
      explanation: `The brand's own claim is contradicted by ${distinct.length} recent independent sources with verified quotes.`,
      sources: attribution,
    }
  }

  // Rule 2b: one authoritative source.
  const authoritative = distinct.find((p) => isAuthoritativePublisher(p.publisher))
  if (authoritative) {
    return {
      applies: true,
      explanation: `The brand's own claim is contradicted by an authoritative body (${authoritative.publisher}).`,
      sources: attribution,
    }
  }

  // Rule 2c: one source plus a decided ruling.
  if (distinct.length === 1 && rulings.length > 0) {
    return {
      applies: true,
      explanation: `The brand's own claim is contradicted by an independent source and a decided ruling ("${rulings[0].title}").`,
      sources: [...attribution, { publisher: rulings[0].entity, sourceUrl: rulings[0].sourceUrl }],
    }
  }

  if (distinct.length === 0) {
    return none('The contradicting evidence is older than 5 years, undated, or lacks a verified quote, so it does not meet the bar for a penalty.')
  }
  return none('Only one recent independent source contradicts the claim. A penalty needs two, or an authoritative body, or a decided ruling.')
}

// ---------------------------------------------------------------------------

export function computeSustainabilityScore(data: BrandAnalysis, vertical: Vertical = 'cosmetics'): SustainabilityScore | null {
  if (!data.hasEvidence) return null

  const claimByCategory = new Map(data.claims.map((c) => [c.category, c]))
  const generated = new Date(data.generatedAt)
  const referenceYear = Number.isNaN(generated.getTime()) ? new Date().getFullYear() : generated.getFullYear()

  const scored = scoredCategoriesFor(vertical)
  const breakdown: Array<SustainabilityScoreBreakdown> = scored.map((category) => {
    const claim = claimByCategory.get(category)

    // The narrow China-only animal-testing compromise keeps its 0.5 and is never penalised.
    if (isChinaOnlyAnimalTestingException(category, claim, data.papers)) {
      return {
        category,
        points: 0.5,
        reason: 'Tests on animals only where legally required to sell in mainland China; cruelty-free everywhere else.',
      }
    }

    const penalty = assessFalseClaimPenalty(category, claim, data.papers, data.legalMatters, referenceYear)
    if (penalty.applies) {
      return {
        category,
        points: PENALTY_POINTS,
        penalty: true,
        reason: `False claim: ${penalty.explanation}`,
      }
    }

    if (category === 'labour-ethics') {
      const pendingMatter = findPendingEthicsLegalMatter(data.legalMatters)
      if (pendingMatter) {
        return {
          category,
          points: 0,
          reason: 'A labour/ethics-related legal matter is pending in court.',
          note: `"${pendingMatter.title}" has not been proven — charges are still pending — so this category scores 0 until resolved rather than being treated as a confirmed violation.`,
        }
      }
    }

    switch (claim?.match) {
      case 'confirmed':
        return { category, points: 1, reason: 'Confirmed by independent sources.' }
      case 'contradicted':
        return {
          category,
          points: 0,
          reason: claim.claim ? 'The brand’s claim is contradicted by independent sources.' : 'Independent sources raise concerns (the brand made no claim here).',
          note: claim.claim ? `No −1 penalty: ${penalty.explanation}` : undefined,
        }
      case 'inconclusive':
        return { category, points: 0.5, reason: 'Independent sources looked into this but reached no clear verdict.' }
      case 'no-data':
      default:
        return { category, points: 0.5, reason: 'No independent evidence found either way.' }
    }
  })

  const rawScore = breakdown.reduce((sum, b) => sum + b.points, 0)
  const penaltiesApplied = breakdown.filter((b) => b.penalty).length
  const categoryCount = scored.length
  const maxScore = DISPLAY_MAX
  // Floor at 0, scale the category total to 0-5, then snap to the nearest half-point.
  const score = Math.round((Math.max(0, rawScore) / categoryCount) * maxScore * 2) / 2

  // Labour/ethics gate stays the ceiling; the -1 applies inside it, never on top of it.
  const labourViolated = claimByCategory.get('labour-ethics')?.match === 'contradicted'
  if (labourViolated && score > LABOUR_VIOLATION_SCORE_CAP) {
    return {
      score: LABOUR_VIOLATION_SCORE_CAP,
      maxScore,
      breakdown,
      rawScore,
      categoryCount,
      penaltiesApplied,
      overrideReason: `Independent sources found this brand violates labour rights or ethical conduct standards — capped at ${LABOUR_VIOLATION_SCORE_CAP}/${maxScore} regardless of how well the other categories score.`,
    }
  }

  return { score, maxScore, breakdown, rawScore, categoryCount, penaltiesApplied }
}
