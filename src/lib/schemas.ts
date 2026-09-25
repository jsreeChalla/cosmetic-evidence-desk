import { z } from 'zod'

/**
 * Shared types for the evidence pipeline. These mirror PRD section 7.2 exactly
 * for the fields the model is asked to produce (overview, parentCompany, papers,
 * legalMatters, claims). Each `BrandClaim.match` is NOT produced by the model —
 * it is derived in research.server.ts by comparing the brand's own stated claim
 * against independent papers' verdicts for that category, so the model is never
 * asked to invent a single-word judgement without evidence behind it.
 */

export const IndependenceSchema = z.enum(['independent', 'company', 'unclear'])
export type Independence = z.infer<typeof IndependenceSchema>

export const ScopeSchema = z.enum(['brand-specific', 'parent-company', 'sector-wide'])
export type Scope = z.infer<typeof ScopeSchema>

export const VerdictSchema = z.enum(['good', 'concerning', 'mixed', 'unclear'])
export type Verdict = z.infer<typeof VerdictSchema>

export const BrandStatusSchema = z.enum(['good', 'concerning', 'mixed', 'unclear', 'no-data'])
export type BrandStatus = z.infer<typeof BrandStatusSchema>

// A retailer vertical determines which extension categories (beyond the
// universal core below) apply to a given brand — see VERTICAL_CATEGORIES.
export const VerticalSchema = z.enum(['cosmetics', 'fashion', 'electronics', 'food'])
export type Vertical = z.infer<typeof VerticalSchema>

// Categories a brand can make a self-published claim about. 'safety' and
// 'sustainability' have dedicated per-paper verdict fields on
// ResearchPaperExtractionSchema (see PRD 7.2); the rest are captured via
// `otherVerdicts` since they only apply to some brands/verticals.
export const ClaimCategorySchema = z.enum([
  // Universal core — meaningful for every vertical.
  'safety',
  'sustainability',
  'labour-ethics',
  // Cosmetics.
  'cruelty-free',
  'vegan',
  'quality',
  // Fashion.
  'material-sourcing',
  'counterfeit-risk',
  // Electronics.
  'e-waste-recyclability',
  'conflict-minerals',
  'data-privacy',
  // Food.
  'sourcing-organic',
  'additives-health',
  'animal-welfare',
])
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>

export const OtherClaimCategorySchema = z.enum([
  'cruelty-free',
  'vegan',
  'labour-ethics',
  'quality',
  'material-sourcing',
  'counterfeit-risk',
  'e-waste-recyclability',
  'conflict-minerals',
  'data-privacy',
  'sourcing-organic',
  'additives-health',
  'animal-welfare',
])
export type OtherClaimCategory = z.infer<typeof OtherClaimCategorySchema>

// Which claim categories apply to a brand, based on its retailer vertical.
// 'safety' / 'sustainability' / 'labour-ethics' are the universal core;
// the rest are vertical-specific extensions. Drives both the extraction
// prompt's per-category instructions and postProcess's second pass over
// categories the brand never made an explicit claim about (research.server.ts).
export const VERTICAL_CATEGORIES: Record<Vertical, Array<ClaimCategory>> = {
  cosmetics: ['safety', 'sustainability', 'labour-ethics', 'cruelty-free', 'vegan', 'quality'],
  fashion: ['safety', 'sustainability', 'labour-ethics', 'material-sourcing', 'counterfeit-risk'],
  electronics: ['safety', 'sustainability', 'labour-ethics', 'e-waste-recyclability', 'conflict-minerals', 'data-privacy'],
  food: ['safety', 'sustainability', 'labour-ethics', 'sourcing-organic', 'additives-health', 'animal-welfare'],
}

// Whether independent evidence backs up, contradicts, or says nothing about
// a brand's own claim. Computed in research.server.ts from independent
// papers' verdicts — never produced directly by the model.
// 'no-data': no independent source addressed this category at all.
// 'inconclusive': an independent source explicitly looked at this category
// (e.g. a cruelty-free tracker) but didn't find a clear good/concerning
// verdict — different from no independent source existing.
export const ClaimMatchSchema = z.enum(['confirmed', 'contradicted', 'inconclusive', 'no-data'])
export type ClaimMatch = z.infer<typeof ClaimMatchSchema>

export const LegalStatusSchema = z.enum(['pending', 'settled', 'decided', 'unclear'])
export type LegalStatus = z.infer<typeof LegalStatusSchema>

export const QuoteVerificationSchema = z.enum(['verified', 'flagged'])
export type QuoteVerification = z.infer<typeof QuoteVerificationSchema>

export const FindingSchema = z.object({
  text: z.string().min(1).describe('One concrete, brand-specific finding, in your own words.'),
  quote: z
    .string()
    .min(1)
    .describe(
      'A VERBATIM 12-40 word quote copied exactly from the source text that supports this finding. Never paraphrase this field.',
    ),
})
export interface Finding {
  text: string
  quote: string
  quoteVerification?: QuoteVerification
}

export const ResearchPaperExtractionSchema = z.object({
  title: z.string(),
  publisher: z
    .string()
    .describe(
      'The actual organization/outlet that published this (e.g. "Good On You", "Reuters", "European Commission") — never just the bare domain name if the source text names the real organization.',
    ),
  fundingDisclosure: z
    .string()
    .optional()
    .describe(
      'Only set this if the source TEXT explicitly states who funded, sponsored, or commissioned it (e.g. "This study was funded by X", "no external funding", "conflicts of interest: none declared"). Copy the disclosure in your own words — do not guess or infer a funding source that is not explicitly stated. This matters most when `independence` is "unclear": a publisher can look independent while the underlying work was industry-funded. Omit entirely if the source says nothing about funding.',
    ),
  year: z
    .number()
    .int()
    .optional()
    .describe(
      'The year this source was published, or last updated/reviewed if the page states that (e.g. "Last updated March 2025", a rating date). Take it only from the source text or its dateline — never guess. Omit if no date is stated.',
    ),
  sourceUrl: z.string(),
  pdfUrl: z.string().optional().describe('Only include if this exact URL literally appears in the fetched source text.'),
  independence: IndependenceSchema,
  scope: ScopeSchema,
  topics: z.array(z.string()).max(6),
  summary: z.string().describe('~60 words, brand-specific, no generic sector commentary.'),
  findings: z.array(FindingSchema).max(5),
  safetyVerdict: VerdictSchema,
  sustainabilityVerdict: VerdictSchema,
  otherVerdicts: z
    .array(z.object({ category: OtherClaimCategorySchema, verdict: VerdictSchema }))
    .max(4)
    .optional()
    .describe(
      'Only for cruelty-free / vegan / labour-ethics: set a verdict here if this source explicitly discusses that category for this brand. Omit entirely otherwise.',
    ),
})

export interface ResearchPaper {
  title: string
  publisher: string
  fundingDisclosure?: string
  year?: number
  sourceUrl: string
  pdfUrl?: string
  independence: Independence
  scope: Scope
  topics: Array<string>
  summary: string
  findings: Array<Finding>
  safetyVerdict: Verdict
  sustainabilityVerdict: Verdict
  otherVerdicts?: Array<{ category: OtherClaimCategory; verdict: Verdict }>
}

export const BrandClaimExtractionSchema = z.object({
  category: ClaimCategorySchema,
  claim: z
    .string()
    .min(1)
    .describe("The brand's own stated claim about itself for this category, in your own words, one sentence."),
  quote: z
    .string()
    .min(1)
    .describe(
      'A VERBATIM 8-40 word quote copied exactly from the COMPANY-PUBLISHED source text that states this claim. Never paraphrase this field.',
    ),
  sourceUrl: z.string(),
})

export interface BrandClaim {
  category: ClaimCategory
  // A brand's own published claim, when one was found. Absent when this
  // entry exists only because independent sources have a verdict for this
  // category even though the brand itself never made a public claim about
  // it — see the second pass in research.server.ts's postProcess().
  claim?: string
  quote?: string
  sourceUrl?: string
  quoteVerification?: QuoteVerification
  match: ClaimMatch
  // The independent source(s) backing `match`. Always set when match is
  // 'confirmed', 'contradicted', or 'inconclusive'; never set for 'no-data'.
  checkedBy?: Array<{ publisher: string; sourceUrl: string }>
}

export const LegalMatterExtractionSchema = z.object({
  title: z.string(),
  entity: z.string().describe('The brand or parent company named in this legal/regulatory matter.'),
  status: LegalStatusSchema,
  year: z.number().int().optional(),
  summary: z.string().describe('One sentence.'),
  sourceUrl: z.string(),
  quote: z.string().describe('A VERBATIM 12-40 word quote copied exactly from the source text.'),
})

export interface LegalMatter {
  title: string
  entity: string
  status: LegalStatus
  year?: number
  summary: string
  sourceUrl: string
  quote: string
  quoteVerification?: QuoteVerification
}

export const BrandExtractionSchema = z.object({
  overview: z
    .string()
    .describe(
      'A 2-3 sentence brand-specific evidence summary. Empty string if no qualifying brand-specific or parent-company document exists.',
    ),
  parentCompany: z
    .string()
    .optional()
    .describe('Only include if a source explicitly states brand is owned by / a subsidiary of this company. Never guess.'),
  papers: z.array(ResearchPaperExtractionSchema).max(20),
  legalMatters: z.array(LegalMatterExtractionSchema).max(8),
  claims: z
    .array(BrandClaimExtractionSchema)
    .max(8)
    .describe(
      "The brand's own claims about itself, taken only from company-published sources. At most one entry per category — omit a category entirely if the brand makes no explicit claim about it in the fetched sources.",
    ),
})
export type BrandExtraction = z.infer<typeof BrandExtractionSchema>

export interface BrandAnalysis {
  brand: string
  parentCompany?: string
  overview: string
  hasEvidence: boolean
  claims: Array<BrandClaim>
  papers: Array<ResearchPaper>
  legalMatters: Array<LegalMatter>
  sourcesConsulted: number
  sourcesFetched: number
  degraded: boolean
  retrievalWarning?: string
  generatedAt: string
}
