// Standalone smoke test for the pure anti-hallucination helpers in
// research.server.ts. Does not call any external API — just verifies the
// quote-verification / aggregation / URL-filtering logic behaves as the PRD
// requires.
//
// Run with: npx esbuild src/lib/research.server.ts --bundle --platform=node --format=esm --outfile=scripts/_bundled-research-server.mjs --external:ai --external:@ai-sdk/anthropic
//           node scripts/test-pipeline-logic.mjs
import assert from 'node:assert/strict'
import {
  isExcludedUrl,
  isGenericDataUrl,
  sourceMentionsToken,
  extractLinkedUrls,
  verifyQuote,
  aggregateStatus,
  parseToolResults,
  resolveModelId,
} from './_bundled-research-server.mjs'

let passed = 0
function check(name, fn) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

check('excludes social platforms', () => {
  assert.equal(isExcludedUrl('https://www.facebook.com/somebrand'), true)
  assert.equal(isExcludedUrl('https://reddit.com/r/beauty'), true)
  assert.equal(isExcludedUrl('https://m.youtube.com/watch?v=1'), true)
})

check('does not exclude independent evidence sources', () => {
  assert.equal(isExcludedUrl('https://directory.goodonyou.eco/brand/yves-rocher-beauty'), false)
  assert.equal(isExcludedUrl('https://crueltyfree.peta.org/company/yves-rocher/'), false)
})

check('blocks fetching generic ingredient-review sources (never brand-specific)', () => {
  assert.equal(isGenericDataUrl('https://www.cir-safety.org/ingredients/retinyl-palmitate'), true)
  assert.equal(isGenericDataUrl('https://cir-reports.cir-safety.org/cir-reports/'), true)
  assert.equal(isGenericDataUrl('https://directory.goodonyou.eco/brand/yves-rocher-beauty'), false)
})

check('sourceMentionsToken rejects a generic page that never names the brand (scope hallucination guard)', () => {
  const genericToxReview =
    "The dark side of beauty: an in-depth analysis of the health hazards and toxicological impact of synthetic cosmetics and personal care products - PMC. Skip to main content. An official website of the United States government."
  assert.equal(sourceMentionsToken('Yves Rocher', genericToxReview), false)
  assert.equal(sourceMentionsToken(undefined, genericToxReview), false)
  assert.equal(sourceMentionsToken('Yves Rocher', undefined), false)
})

check('sourceMentionsToken accepts a page that actually names the brand, ignoring a search-variant parenthetical', () => {
  const brandSpecificText = 'ghd was fined by the regulator for a 2022 labelling violation on its styling products.'
  assert.equal(sourceMentionsToken('ghd (Good Hair Day)', brandSpecificText), true)
})

check('extracts linked URLs from fetched text', () => {
  const urls = extractLinkedUrls('See report at https://example.com/report.pdf and also https://example.org/doi/10.1/x.')
  assert.deepEqual(urls, ['https://example.com/report.pdf', 'https://example.org/doi/10.1/x'])
})

check('verifyQuote verifies an exact substring after normalization', () => {
  const source = 'The company stated: "We eliminated palm oil derivatives from all formulas in 2023." Full stop.'
  const quote = 'We eliminated palm oil derivatives from all formulas in 2023.'
  assert.equal(verifyQuote(quote, source), 'verified')
})

check('verifyQuote tolerates curly quotes / dash / whitespace differences', () => {
  const source = 'Report:\n\n“Independent testing found no restricted substances in the 2024 batch — all samples passed.”'
  const quote = 'Independent testing found no restricted substances in the 2024 batch - all samples passed.'
  assert.equal(verifyQuote(quote, source), 'verified')
})

check('verifyQuote flags a quote that is not actually in the source (fabrication guard)', () => {
  const source = 'The brand publishes an annual sustainability report covering packaging.'
  const quote = 'The brand was fined ten million euros for false advertising in 2022.'
  assert.equal(verifyQuote(quote, source), 'flagged')
})

check('verifyQuote flags anything when there is no source text at all', () => {
  assert.equal(verifyQuote('any quote', undefined), 'flagged')
})

check('aggregateStatus returns no-data for an empty paper set', () => {
  assert.equal(aggregateStatus([]), 'no-data')
})

check('aggregateStatus returns the majority verdict', () => {
  assert.equal(aggregateStatus(['good', 'good', 'concerning']), 'good')
})

check('aggregateStatus returns mixed on a real good/concerning tie', () => {
  assert.equal(aggregateStatus(['good', 'concerning']), 'mixed')
})

check('resolveModelId rejects Vertex aliases and falls back to a validated Anthropic model', () => {
  assert.equal(resolveModelId('vertex_ai/claude-opus-4-8'), 'claude-opus-4-8')
  assert.equal(resolveModelId('  vertex_ai/claude-sonnet-4-20250514  '), 'claude-sonnet-4-20250514')
  assert.equal(resolveModelId('claude-opus-4-8'), 'claude-opus-4-8')
  assert.equal(resolveModelId('not-a-model-name'), 'claude-opus-4-8')
  assert.equal(resolveModelId('claude-opus-4-8'), 'claude-opus-4-8')
})

check('parseToolResults extracts web_search hits (no body text) and web_fetch hits (with body text)', () => {
  const content = [
    { type: 'text', text: 'narration, should be ignored' },
    {
      type: 'tool-result',
      toolName: 'web_search',
      output: [{ type: 'web_search_result', url: 'https://ngo.example/report', title: 'NGO report', pageAge: null, encryptedContent: 'xyz' }],
    },
    {
      type: 'tool-result',
      toolName: 'web_fetch',
      output: {
        type: 'web_fetch_result',
        url: 'https://ngo.example/report',
        content: { type: 'document', title: 'NGO report', source: { type: 'text', mediaType: 'text/plain', data: 'Full report text.' } },
        retrievedAt: null,
      },
    },
  ]
  const out = parseToolResults(content)
  assert.equal(out.length, 2)
  assert.equal(out[0].fetched, false)
  assert.equal(out[1].fetched, true)
  assert.equal(out[1].text, 'Full report text.')
})

console.log(`\n${passed} checks passed.`)
