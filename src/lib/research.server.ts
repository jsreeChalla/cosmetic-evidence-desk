import { generateObject, generateText, stepCountIs } from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import type { BrandCatalogEntry } from './igraal-brands'
import {
  BrandExtractionSchema,
  VERTICAL_CATEGORIES,
  type BrandAnalysis,
  type BrandClaim,
  type ClaimCategory,
  type ClaimMatch,
  type Finding,
  type LegalMatter,
  type OtherClaimCategory,
  type QuoteVerification,
  type ResearchPaper,
  type BrandStatus,
  type Verdict,
  type Vertical,
} from './schemas'
import { sortByRecency, weightedAggregateStatus } from './recency'

/**
 * ---------------------------------------------------------------------------
 * Provider note (see README for the full explanation)
 * ---------------------------------------------------------------------------
 * The PRD (section 9) specifies Firecrawl for retrieval and the Lovable AI
 * Gateway for structured extraction. `runTopicRetrieval` can try Firecrawl's
 * `/search` (with scrapeOptions, so a single call returns full-page markdown
 * for the top results — see firecrawlSearchAndScrape()) first when
 * FIRECRAWL_API_KEY is set, but ONLY when explicitly allowed via
 * `researchBrand(brand, { allowFirecrawl: true })` — Firecrawl credits are
 * metered and shared account-wide, so a live visitor's brand lookup (the
 * common case, via research.functions.ts) does NOT spend them; only the
 * deliberate, rate-limited daily cache batch (scripts/refresh-brand-cache.mjs)
 * opts in. Structured extraction still runs on Claude's own server (via the
 * Vercel AI SDK's Anthropic provider), reached with either a direct
 * ANTHROPIC_API_KEY or an internal Anthropic-compatible gateway
 * (ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN — see getAnthropicClient()).
 *
 * When Firecrawl isn't allowed or isn't configured, retrieval falls back, in order, to: Claude's own server-executed
 * `web_search`+`web_fetch` tools, then Claude `web_search`-only, then a
 * keyless DuckDuckGo HTML scrape — each tier only runs if the one before it
 * throws. The Claude-tools tiers are currently blocked outright by some
 * deployments' org-level Vertex AI policy (`allowedPartnerModelFeatures`
 * disallowing the `web_search`/`web_fetch` features for the partner model) —
 * they're kept rather than removed so they resume working automatically if
 * that policy is ever lifted, without another code change.
 *
 * One consequence worth knowing: Claude's `web_search` tool alone returns
 * `{url, title, pageAge, encryptedContent}` — no extractable body text (the
 * encrypted payload is only usable by Claude in the *same* conversation, not
 * by our server code). Only `web_fetch` results, or Firecrawl/DuckDuckGo
 * results, give us plain text we can store and verify quotes against. So
 * findings and legal matters are only ever extracted from sources that were
 * actually fetched; search-only hits (e.g. when a fetch times out) still
 * count toward "sources consulted" and can surface an ownership/name signal,
 * but never produce a quoted claim. That is a stricter anti-hallucination
 * guarantee than the PRD asked for, not a weaker one.
 */

// Read per-call, not at module scope: module-level `process.env` reads can leak
// into edge/worker deployments where env is injected per-request (see
// @tanstack/react-start's execution-model guidance).
//
// `passthrough` is used when we're going through an internal Anthropic-compatible
// gateway (ANTHROPIC_BASE_URL set): such a gateway may use its own routing
// prefixes in the model id (e.g. "vertex_ai/claude-opus-4-8" to pick a Vertex
// backend) that would be meaningless — and get stripped — against Anthropic's
// own direct API, so trust it verbatim instead of validating/stripping it.
export function resolveModelId(modelId?: string, opts?: { passthrough?: boolean }): string {
  const raw = (modelId ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8').trim()
  if (!raw) return 'claude-opus-4-8'

  if (opts?.passthrough) return raw

  const stripped = raw.replace(/^(?:vertex_ai|anthropic)\//i, '').trim()
  const candidate = stripped || raw

  // Accept common Anthropic model IDs used in the wild (examples:
  //  - claude-opus-4-8)
  if (/^claude-(?:opus|sonnet)-[a-z0-9-]+(?:-\d{8}|-\d{4}-\d{2}-\d{2})?$/i.test(candidate)) {
    return candidate
  }

  return 'claude-opus-4-8'
}

function getModelId(): string {
  return resolveModelId(undefined, { passthrough: !!process.env.ANTHROPIC_BASE_URL?.trim() })
}

// @ai-sdk/anthropic's default `anthropic` export auto-reads ANTHROPIC_BASE_URL
// and ANTHROPIC_API_KEY from the environment already, but it never auto-reads
// an ANTHROPIC_AUTH_TOKEN (bearer-style auth) — that has to be wired in
// explicitly via createAnthropic. This is how an internal Anthropic-compatible
// gateway is authenticated (the same scheme Claude Code itself uses against
// such a gateway), as opposed to a direct Anthropic Console API key.
function getAnthropicClient() {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim()
  return authToken ? createAnthropic({ authToken }) : anthropic
}

const EXCLUDED_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'quora.com',
  'linkedin.com',
  'pinterest.com',
]

// The Cosmetic Ingredient Review publishes generic, industry-wide ingredient
// safety assessments — never brand-specific — so its pages always end up
// scope: 'sector-wide' and get discarded (PRD 7.3). Fetching them just burns
// one of the few web_fetch slots per search pass on a page we already know
// we'll throw away. Block fetching only; it's still fine (and free) for it
// to surface as a search-only hit.
const GENERIC_DATA_DOMAINS = ['cir-safety.org']

function hostMatchesDomain(url: string, domains: Array<string>): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return domains.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return true
  }
}

interface SearchTopic {
  key: string
  label: string
  query: (brand: string) => string
}

// PRD 7.1: parallel search queries per brand. 'brand-claims' is the one topic
// where we deliberately go looking for company-published material (the
// brand's own claims about itself), so its own claims can be checked against
// what everything else here says.
//
// CORE_TOPICS run for every vertical (kept vertical-neutral in wording).
// VERTICAL_TOPICS adds a few extra, vertical-specific searches on top —
// e.g. cosmetics asks about cruelty-free certification, electronics asks
// about e-waste/conflict minerals — matching that vertical's extension
// categories in schemas.ts's VERTICAL_CATEGORIES.
const CORE_TOPICS: Array<SearchTopic> = [
  {
    key: 'brand-claims',
    label: "Brand's own claims about itself",
    query: (b) => `${b} official website sustainability ethical safety claims`,
  },
  {
    key: 'sustainability-packaging',
    label: 'Sustainability & packaging',
    query: (b) => `${b} sustainability report packaging environmental impact`,
  },
  {
    key: 'ethical-ratings',
    label: 'Ethical ratings',
    query: (b) => `${b} ethical rating independent brand rating`,
  },
  {
    key: 'supply-chain',
    label: 'Supply chain & labour rights',
    query: (b) => `${b} supply chain labour rights audit factory conditions`,
  },
  {
    key: 'ownership',
    label: 'Corporate ownership',
    query: (b) => `${b} parent company owned by subsidiary group`,
  },
  {
    key: 'legal-regulatory',
    label: 'Legal & regulatory actions',
    query: (b) => `${b} lawsuit regulatory action recall fine investigation`,
  },
]

const VERTICAL_TOPICS: Record<Vertical, Array<SearchTopic>> = {
  cosmetics: [
    {
      key: 'ingredient-safety',
      label: 'Ingredient safety & toxicology',
      query: (b) => `${b} cosmetics ingredient safety toxicology study OR regulator assessment`,
    },
    {
      key: 'cruelty-free',
      label: 'Animal testing & cruelty-free certification',
      query: (b) => `${b} animal testing cruelty-free certification Leaping Bunny PETA vegan`,
    },
    {
      key: 'product-quality',
      label: 'Product quality & customer reviews',
      query: (b) => `${b} product quality reviews complaints effectiveness reformulation`,
    },
  ],
  fashion: [
    {
      key: 'material-sourcing',
      label: 'Material sourcing',
      query: (b) => `${b} sustainable materials organic cotton recycled fibers fur leather policy`,
    },
    {
      key: 'counterfeit-risk',
      label: 'Counterfeit & authenticity risk',
      query: (b) => `${b} counterfeit fake products authenticity brand protection`,
    },
  ],
  electronics: [
    {
      key: 'e-waste-recyclability',
      label: 'E-waste & right to repair',
      query: (b) => `${b} e-waste recycling program right to repair`,
    },
    {
      key: 'conflict-minerals',
      label: 'Conflict minerals & responsible sourcing',
      query: (b) => `${b} conflict minerals responsible sourcing supply chain`,
    },
    {
      key: 'data-privacy',
      label: 'Data privacy & security',
      query: (b) => `${b} data privacy breach security practices`,
    },
  ],
  food: [
    {
      key: 'sourcing-organic',
      label: 'Ingredient sourcing',
      query: (b) => `${b} organic sourcing ingredient origin`,
    },
    {
      key: 'additives-health',
      label: 'Additives & health concerns',
      query: (b) => `${b} food additives health concerns study`,
    },
    {
      key: 'animal-welfare',
      label: 'Animal welfare & farming practices',
      query: (b) => `${b} animal welfare farming practices certification`,
    },
  ],
}

function searchTopicsFor(vertical: Vertical): Array<SearchTopic> {
  return [...CORE_TOPICS, ...VERTICAL_TOPICS[vertical]]
}

interface SourceRecord {
  url: string
  title: string
  topics: Set<string>
  text?: string
  fetched: boolean
  linkedUrls: Set<string>
}

interface TopicOutcome {
  topic: SearchTopic
  sources: Array<{ url: string; title: string; text?: string; fetched: boolean }>
  degraded: boolean
}

export function isExcludedUrl(url: string): boolean {
  return hostMatchesDomain(url, EXCLUDED_DOMAINS)
}

export function isGenericDataUrl(url: string): boolean {
  return hostMatchesDomain(url, GENERIC_DATA_DOMAINS)
}

export function extractLinkedUrls(text: string): Array<string> {
  const matches = text.match(/https?:\/\/[^\s")'\]]+/g) ?? []
  return matches.map((m) => m.replace(/[.,;:]+$/, ''))
}

// Firecrawl's /search endpoint with scrapeOptions does search + full-page
// scrape of the top results in one call — the same shape Claude's
// web_search+web_fetch tools would have produced, but via a normal REST API
// instead of a partner-model feature that can be (and currently is) blocked
// by org policy. Read the key per-call, same reasoning as getModelId above.
async function firecrawlSearchAndScrape(
  query: string,
  limit: number,
): Promise<Array<{ url: string; title: string; text?: string; fetched: boolean }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured')

  const res = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Firecrawl search failed: ${res.status}`)

  const json = (await res.json()) as {
    success?: boolean
    data?: { web?: Array<{ url?: string; title?: string; markdown?: string }> }
  }
  if (!json.success) throw new Error('Firecrawl search returned success: false')

  const web = json.data?.web ?? []
  return web
    .filter((item): item is { url: string; title?: string; markdown?: string } => typeof item.url === 'string')
    .map((item) => ({
      url: item.url,
      title: item.title ?? item.url,
      text: typeof item.markdown === 'string' && item.markdown.length > 0 ? item.markdown.slice(0, 200_000) : undefined,
      fetched: typeof item.markdown === 'string' && item.markdown.length > 0,
    }))
}

// Builds a readable diagnostic string from a thrown value. Plain `err.message`
// often comes back empty for the AI SDK's APICallError (the real detail is on
// `.statusCode`/`.responseBody`/`.cause` instead), which is why the earlier
// fallback logs showed `reason=` with nothing after it.
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const anyErr = err as Error & { statusCode?: number; responseBody?: string; cause?: unknown }
  const parts = [err.name, err.message].filter((s) => s && s.trim().length > 0)
  if (anyErr.statusCode) parts.push(`status=${anyErr.statusCode}`)
  if (typeof anyErr.responseBody === 'string' && anyErr.responseBody.trim().length > 0) {
    parts.push(`body=${anyErr.responseBody.slice(0, 300)}`)
  }
  if (anyErr.cause) parts.push(`cause=${describeError(anyErr.cause)}`)
  return parts.length > 0 ? parts.join(' | ') : '(no error detail available)'
}

// Claude's server-executed web_search/web_fetch tools are blocked outright by
// some deployments' org-level Vertex AI policy (`allowedPartnerModelFeatures`
// disallowing the `web_search`/`web_fetch` features for the partner model) —
// confirmed via live fallback logs showing 100% of topics failing this tier.
// Retrying a known-dead tier on every single topic of every live lookup costs
// ~40s of pure latency for zero benefit, so it's skipped by default. Set
// CLAUDE_WEB_TOOLS_BLOCKED=false once your org's policy allows these
// features again, to resume using them without any other code change.
function claudeWebToolsBlocked(): boolean {
  return process.env.CLAUDE_WEB_TOOLS_BLOCKED?.trim().toLowerCase() !== 'false'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// DuckDuckGo returns its anti-bot "202 please wait" challenge page (zero
// results, not an error we can catch) when it sees a burst of simultaneous
// requests from the same IP — confirmed empirically: 8 requests fired at
// once all came back empty, while the same request alone succeeded. Since
// every topic now routes through this tier by default (Firecrawl is
// batch-only, Claude tools are policy-blocked — see runTopicRetrieval), all
// 8 of a brand's topics used to hit DuckDuckGo in the same instant. Staggering
// each topic's DuckDuckGo call by its index spreads that burst out instead.
const DUCKDUCKGO_STAGGER_MS = 1500

async function duckDuckGoFallback(
  brandName: string,
  topic: SearchTopic,
  staggerMs: number,
): Promise<Array<{ url: string; title: string; text?: string; fetched: boolean }>> {
  if (staggerMs > 0) await sleep(staggerMs)
  const urls = (await duckDuckGoSearch(topic.query(brandName))).filter((u) => !isGenericDataUrl(u))
  const fetched: Array<{ url: string; title: string; text?: string; fetched: boolean }> = []
  for (const u of urls.slice(0, 4)) {
    try {
      const text = await fetchPageText(u)
      fetched.push({ url: u, title: u, text, fetched: !!text })
    } catch {
      fetched.push({ url: u, title: u, fetched: false })
    }
  }
  console.error(
    `[retrieval-fallback] brand="${brandName}" topic="${topic.key}" duckduckgo result: ${fetched.length} url(s), ${fetched.filter((f) => f.fetched).length} fetched`,
  )
  return fetched
}

async function runTopicRetrieval(brandName: string, topic: SearchTopic, allowFirecrawl: boolean, topicIndex: number): Promise<TopicOutcome> {
  if (allowFirecrawl && process.env.FIRECRAWL_API_KEY?.trim()) {
    try {
      const sources = (await firecrawlSearchAndScrape(topic.query(brandName), 4)).filter((s) => !isGenericDataUrl(s.url))
      return { topic, sources, degraded: false }
    } catch (err) {
      console.error(`[retrieval-fallback] brand="${brandName}" topic="${topic.key}" firecrawl->claude-tools reason=${describeError(err)}`)
      // Fall through to the Claude-tools / DuckDuckGo cascade below.
    }
  }

  if (claudeWebToolsBlocked()) {
    try {
      const sources = await duckDuckGoFallback(brandName, topic, topicIndex * DUCKDUCKGO_STAGGER_MS)
      return { topic, sources, degraded: true }
    } catch (err) {
      console.error(
        `[retrieval-fallback] brand="${brandName}" topic="${topic.key}" duckduckgo failed too, giving up on this topic reason=${describeError(err)}`,
      )
      return { topic, sources: [], degraded: true }
    }
  }

  const client = getAnthropicClient()
  const tools = {
    web_search: client.tools.webSearch_20250305({
      maxUses: 4,
      blockedDomains: EXCLUDED_DOMAINS,
      userLocation: { type: 'approximate' as const, country: 'FR' },
    }),
    web_fetch: client.tools.webFetch_20250910({
      maxUses: 3,
      blockedDomains: [...EXCLUDED_DOMAINS, ...GENERIC_DATA_DOMAINS],
      maxContentTokens: 8000,
    }),
  }

  const prompt =
    topic.key === 'brand-claims'
      ? [
          `Brand: "${brandName}" (a brand or retailer sold in France).`,
          `Research focus for this pass: ${topic.label}.`,
          `Search query to start from: ${topic.query(brandName)}`,
          '',
          'Instructions:',
          "- Find the brand's own official website (About / FAQ / Sustainability / Ethics pages) and any official press releases it published.",
          '- This is the one pass where company-published material is exactly what you want — do NOT look for independent or NGO coverage here, that happens in other passes.',
          '- Fetch (with the fetch tool) the 2-4 most relevant official pages so their full text is available.',
          '- Do not fetch the same URL twice. Do not fabricate URLs.',
          '- After searching and fetching, reply with a short plain-text list of the URLs you fetched and why, in one line each. Do not write a long summary.',
        ].join('\n')
      : [
          `Brand: "${brandName}" (a brand or retailer sold in France).`,
          `Research focus for this pass: ${topic.label}.`,
          `Search query to start from: ${topic.query(brandName)}`,
          '',
          'Instructions:',
          '- Run the search tool to find independently published sources (NGOs, regulators, journalists, peer-reviewed research, watchdog/rating organisations, court or regulator records).',
          '- Prefer sources that discuss this brand specifically, or its named parent company. Ignore sources that only discuss its sector in general without naming the brand or its parent.',
          '- Do NOT use social networks or forums as sources.',
          '- Fetch (with the fetch tool) the 2-4 most promising, credible, brand-specific pages so their full text is available.',
          '- Do not fetch the same URL twice. Do not fabricate URLs.',
          '- After searching and fetching, reply with a short plain-text list of the URLs you fetched and why, in one line each. Do not write a long summary.',
        ].join('\n')

  try {
    const result = await generateText({
      model: client(getModelId()),
      tools,
      stopWhen: stepCountIs(6),
      timeout: { totalMs: 30_000, tools: { web_fetchMs: 15_000 } },
      prompt,
    })
    return { topic, sources: parseToolResults(result.content), degraded: false }
  } catch (err) {
    console.error(`[retrieval-fallback] brand="${brandName}" topic="${topic.key}" claude-tools->claude-search-only reason=${describeError(err)}`)
    // Fallback per PRD 7.1: a slow/failed scrape must never empty the result set.
    // 1) Retry with search-only via Anthropic if possible.
    try {
      const fallback = await generateText({
        model: client(getModelId()),
        tools: { web_search: tools.web_search },
        stopWhen: stepCountIs(2),
        timeout: { totalMs: 12_000 },
        prompt: `Brand: "${brandName}". ${topic.query(brandName)}. Just search, do not fetch pages.`,
      })
      return { topic, sources: parseToolResults(fallback.content), degraded: true }
    } catch (err2) {
      console.error(`[retrieval-fallback] brand="${brandName}" topic="${topic.key}" claude-search-only->duckduckgo reason=${describeError(err2)}`)
      // 2) If Anthropic search is unavailable, attempt a lightweight, keyless
      // HTML-based DuckDuckGo search + fetch of the top candidate pages. This
      // is a pragmatic fallback when the web tools cannot be called.
      try {
        const sources = await duckDuckGoFallback(brandName, topic, topicIndex * DUCKDUCKGO_STAGGER_MS)
        return { topic, sources, degraded: true }
      } catch (err3) {
        console.error(
          `[retrieval-fallback] brand="${brandName}" topic="${topic.key}" duckduckgo failed too, giving up on this topic reason=${describeError(err3)}`,
        )
        return { topic, sources: [], degraded: true }
      }
    }
  }
}

async function duckDuckGoSearch(query: string): Promise<string[]> {
  await ensureFetch()
  const q = encodeURIComponent(query)
  const url = `https://duckduckgo.com/html/?q=${q}`
  const res = await fetch(url, { headers: { 'User-Agent': 'reliability-check/1.0' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return []
  const html = await res.text()
  // Prefer explicit result anchors that DuckDuckGo encodes with a `uddg`
  // parameter. Fall back to any absolute external http(s) URLs found.
  const seen = new Set<string>()
  const out: string[] = []

  // Extract attributes that commonly carry result targets: href and data-href
  const linkMatches = Array.from(html.matchAll(/(?:href|data-href)=["']([^"']+)["']/g))
  const hrefs = linkMatches.map((m) => m[1])

  // Also capture any absolute URLs as a fallback
  const absMatches = Array.from(html.matchAll(/https?:\/\/[\w\-._~:\/\?#\[\]@!$&'()*+,;=%]+/g))
  const absUrls = absMatches.map((m) => m[0])

  for (const u of [...hrefs, ...absUrls]) {
    try {
      let candidate = u

      // If it's a relative DuckDuckGo redirect (e.g. /l/?uddg=...), prefix it
      if (candidate.startsWith('/')) candidate = `https://duckduckgo.com${candidate}`

      // If the link is a DuckDuckGo redirect or result wrapper, prefer the
      // decoded `uddg` target URL when present.
      try {
        const parsed = new URL(candidate)
        const hostname = parsed.hostname.replace(/^www\./, '')
        if (hostname.endsWith('duckduckgo.com')) {
          const uddg = parsed.searchParams.get('uddg')
          if (uddg) {
            try {
              candidate = decodeURIComponent(uddg)
            } catch {
              candidate = uddg
            }
          } else {
            // Skip bare DuckDuckGo search or homepage links
            continue
          }
        }
      } catch {
        // If URL parsing fails, skip this candidate
        continue
      }

      // Validate the candidate now that it's decoded
      const host = new URL(candidate).hostname.replace(/^www\./, '')
      if (EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) continue
      if (host === 'w3.org') continue
      if (candidate.includes('StyleSheets') || candidate.includes('.dtd') || candidate.includes('/rdf/')) continue
      if (/\.(?:css|xml|dtd|rdf|png|jpe?g|svg|ico|woff2?|ttf)(?:[?#].*)?$/i.test(candidate)) continue
      if (!candidate.startsWith('http')) continue
      if (!seen.has(candidate)) {
        seen.add(candidate)
        out.push(candidate)
      }
    } catch {
      continue
    }
    if (out.length >= 10) break
  }
  return out
}

async function fetchPageText(url: string): Promise<string | undefined> {
  await ensureFetch()
  const res = await fetch(url, {
    headers: { 'User-Agent': 'reliability-check/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return undefined
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text')) return undefined
  const txt = await res.text()
  // Limit size
  // If this is HTML, strip tags and script/style blocks to produce readable
  // plain text for previews. Avoid pulling raw HTML into UI cards.
  if (ct.includes('html') || /^\s*<!doctype/i.test(txt) || /^\s*<html/i.test(txt)) {
    try {
      let html = txt
      // Remove script and style contents
      html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
      // Remove comments
      html = html.replace(/<!--([\s\S]*?)-->/g, ' ')
      // Replace block-level tags with newlines to preserve some structure
      html = html.replace(/<(?:br|p|div|li|h[1-6])[^>]*>/gi, '\n')
      // Strip remaining tags
      let text = html.replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      text = text.replace(/&nbsp;/gi, ' ')
      text = text.replace(/&amp;/gi, '&')
      text = text.replace(/&lt;/gi, '<')
      text = text.replace(/&gt;/gi, '>')
      text = text.replace(/&quot;/gi, '"')
      text = text.replace(/&#39;/g, "'")
      // Numeric entities
      text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
      // Collapse whitespace
      text = text.replace(/\s+/g, ' ').trim()
      return text.slice(0, 200_000)
    } catch {
      return txt.slice(0, 200_000)
    }
  }

  return txt.slice(0, 200_000)
}

async function ensureFetch() {
  if (typeof fetch !== 'undefined') return
  try {
    const nf = await import('node-fetch')
    // node-fetch v3+ exports the fetch as default
    // Attach shims to globalThis for server-side use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyNf: any = nf
    globalThis.fetch = anyNf.default ?? anyNf
    globalThis.Headers = globalThis.Headers ?? (anyNf.Headers ?? class Headers {})
    globalThis.Request = globalThis.Request ?? (anyNf.Request ?? class Request {})
    globalThis.Response = globalThis.Response ?? (anyNf.Response ?? class Response {})
  } catch {
    // If import fails, leave fetch undefined; callers will handle errors.
  }
}

export function parseToolResults(
  content: ReadonlyArray<{ type: string; toolName?: string; output?: unknown }>,
): Array<{ url: string; title: string; text?: string; fetched: boolean }> {
  const out: Array<{ url: string; title: string; text?: string; fetched: boolean }> = []

  for (const part of content) {
    if (part.type !== 'tool-result') continue

    if (part.toolName === 'web_search' && Array.isArray(part.output)) {
      for (const r of part.output as Array<{ url?: string; title?: string | null }>) {
        if (r?.url) out.push({ url: r.url, title: r.title ?? r.url, fetched: false })
      }
    }

    if (part.toolName === 'web_fetch' && part.output && typeof part.output === 'object') {
      const fetchResult = part.output as {
        url?: string
        content?: {
          title?: string | null
          source?: { type?: string; mediaType?: string; data?: string }
        }
      }
      const source = fetchResult.content?.source
      if (fetchResult.url && source?.type === 'text' && typeof source.data === 'string') {
        out.push({
          url: fetchResult.url,
          title: fetchResult.content?.title ?? fetchResult.url,
          text: source.data,
          fetched: true,
        })
      } else if (fetchResult.url) {
        // PDF or non-text content: keep the URL as a candidate, but no body text to verify against.
        out.push({ url: fetchResult.url, title: fetchResult.content?.title ?? fetchResult.url, fetched: false })
      }
    }
  }

  return out
}

interface CollectedEvidence {
  sources: Map<string, SourceRecord>
  degraded: boolean
  sourcesConsulted: number
  sourcesFetched: number
}

async function collectBrandEvidence(brandName: string, vertical: Vertical, allowFirecrawl: boolean): Promise<CollectedEvidence> {
  const topics = searchTopicsFor(vertical)
  const settled = await Promise.allSettled(topics.map((topic, i) => runTopicRetrieval(brandName, topic, allowFirecrawl, i)))

  const sources = new Map<string, SourceRecord>()
  let degraded = false
  const topicSummary: Array<string> = []

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const topicKey = topics[i].key
    if (outcome.status === 'rejected') {
      degraded = true
      topicSummary.push(`${topicKey}=rejected(${describeError(outcome.reason)})`)
      continue
    }
    const { topic, sources: found, degraded: topicDegraded } = outcome.value
    if (topicDegraded) degraded = true
    topicSummary.push(`${topicKey}=${topicDegraded ? 'FALLBACK' : 'firecrawl'}(${found.length} sources, ${found.filter((f) => f.fetched).length} fetched)`)

    for (const item of found) {
      if (isExcludedUrl(item.url)) continue
      const existing = sources.get(item.url)
      if (existing) {
        existing.topics.add(topic.key)
        if (item.text && !existing.text) {
          existing.text = item.text
          existing.fetched = true
          existing.linkedUrls = new Set(extractLinkedUrls(item.text))
        }
      } else {
        sources.set(item.url, {
          url: item.url,
          title: item.title,
          topics: new Set([topic.key]),
          text: item.text,
          fetched: item.fetched,
          linkedUrls: new Set(item.text ? extractLinkedUrls(item.text) : []),
        })
      }
    }
  }

  const fetchedCount = [...sources.values()].filter((s) => s.fetched && s.text).length
  console.error(`[retrieval-summary] brand="${brandName}" degraded=${degraded} ${topicSummary.join(' | ')}`)

  return { sources, degraded, sourcesConsulted: sources.size, sourcesFetched: fetchedCount }
}

function buildCorpus(sources: Map<string, SourceRecord>): string {
  // Cap the number of full-text sources fed to the extraction model. With
  // reliable retrieval (Firecrawl fetches nearly everything, unlike the old
  // partial DuckDuckGo fetches) this can otherwise grow without bound for a
  // well-covered brand, pushing prompt size — and extraction latency — up
  // indefinitely.
  const fetchedSources = [...sources.values()].filter((s) => s.fetched && s.text).slice(0, 16)
  const searchOnly = [...sources.values()].filter((s) => !(s.fetched && s.text))

  const blocks = fetchedSources.map((s, i) => {
    const text = (s.text ?? '').slice(0, 6000)
    return [
      `--- SOURCE ${i + 1} ---`,
      `URL: ${s.url}`,
      `TITLE: ${s.title}`,
      `TOPICS: ${[...s.topics].join(', ')}`,
      `TEXT:`,
      text,
    ].join('\n')
  })

  const searchOnlyList = searchOnly
    .slice(0, 15)
    .map((s) => `- ${s.title} (${s.url}) [topics: ${[...s.topics].join(', ')}] — NOT FETCHED, title/URL only, no body text.`)
    .join('\n')

  return [
    'FETCHED SOURCES (full text available — quotes MUST come only from these):',
    blocks.length > 0 ? blocks.join('\n\n') : '(none fetched successfully)',
    '',
    'SEARCH-ONLY RESULTS (title/URL only, NO body text — never quote these, never use them alone to assert a fact, at most use them as a weak ownership/name signal):',
    searchOnlyList.length > 0 ? searchOnlyList : '(none)',
  ].join('\n')
}

async function extractBrandData(brandName: string, sources: Map<string, SourceRecord>, vertical: Vertical) {
  const fetchedCount = [...sources.values()].filter((s) => s.fetched && s.text).length
  if (fetchedCount === 0) {
    return { overview: '', parentCompany: undefined, papers: [], legalMatters: [], claims: [] }
  }

  const corpus = buildCorpus(sources)
  const categories = VERTICAL_CATEGORIES[vertical]
  const otherCategories = categories.filter((c) => c !== 'safety' && c !== 'sustainability')

  const system = [
    `You are an evidence-extraction assistant for a shopper-facing ${vertical} research tool.`,
    'Your ONLY job is to extract brand-specific or parent-company-specific claims that are directly supported by the FETCHED SOURCES text you are given below. Never use outside knowledge, never guess, never fill gaps with generic industry commentary.',
    'Hard rules:',
    '1. Every finding, legal matter, and claim MUST include a `quote` field that is an EXACT, VERBATIM, contiguous excerpt copied character-for-character from that source\'s TEXT block (12-40 words for findings/legal matters, 8-40 words for claims). Never paraphrase inside `quote`. If you cannot find a real quotable excerpt, omit that finding/legal matter/claim entirely.',
    '2. Only cite a `sourceUrl` that appears in the FETCHED SOURCES list above (never a search-only URL, never a URL you recall from training).',
    '3. `parentCompany` must only be set if a fetched source explicitly states the ownership relationship. Otherwise omit it.',
    `4. \`scope\` must be "sector-wide" for any source that only discusses the ${vertical} industry, a product category, or a regulatory topic generically without the brand name (or its named parent company) appearing verbatim, at least once, in that source's TEXT block — but you should simply not produce a paper entry for purely sector-wide sources at all. Do not infer brand-specificity from a shared product category, a general safety topic, or the fact that it showed up under a brand-specific search: if you cannot point to the literal brand name (or parent company name) written in the TEXT you were given, it is sector-wide.`,
    '5. `pdfUrl` may only be set to a URL that literally appears as text inside the source content you were given.',
    '6. If nothing in the fetched sources is brand-specific or parent-company-specific, return an empty `overview` string and empty `papers`/`legalMatters`/`claims` arrays. Do not invent an evidence base to fill space.',
    '7. `overview` is 2-3 sentences, brand-specific, evidence-based — not generic sector commentary.',
    `8. \`claims\` captures the BRAND'S OWN stated claims about itself, taken ONLY from sources whose \`independence\` you would mark as "company" (the brand's own site, its own press releases). At most one claim per category (${categories.join(', ')}) — omit a category entirely if the brand does not explicitly claim something about it in the fetched sources. Never infer a claim from an independent source.`,
    `9. For a \`papers\` entry whose \`independence\` is "independent" and whose text explicitly discusses one of this vertical's extension categories (${otherCategories.join(', ')}) for this brand, also set \`otherVerdicts\` with the matching categor(y/ies) and a verdict. Omit \`otherVerdicts\` entirely when none applies.`,
    '10. `publisher` must name the actual organization behind the source (the outlet, NGO, regulator, or publication — not just its domain) whenever the TEXT identifies it. Set `fundingDisclosure` ONLY when the TEXT explicitly states who funded/sponsored/commissioned the work, or explicitly states there was no external funding — this is especially important when `independence` is "unclear", since a source can look independent while being industry-funded. Never guess a funding source; omit the field if the TEXT is silent on it.',
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: getAnthropicClient()(getModelId()),
      schema: BrandExtractionSchema,
      system,
      // Now that retrieval reliably fetches most/all sources (Firecrawl,
      // unlike the old partial DuckDuckGo fetches), the corpus is routinely
      // large enough that 25s isn't enough processing time — was silently
      // timing out and falling back to the crude local synthesis, which can
      // never produce a real independence classification or claims. The
      // 'jsonTool' structured-output mode forced above (to route around the
      // Vertex structured_outputs block) is also measurably slower than
      // native structured output for a schema this size, so this needs more
      // headroom than a quick fix — paired with the corpus cap below.
      abortSignal: AbortSignal.timeout(90_000),
      prompt: `Brand: "${brandName}"\n\n${corpus}`,
      // Some Anthropic-compatible gateways (e.g. an org's Vertex AI routing
      // policy) block the newer native "structured outputs" feature per
      // partner-model allowlist, while plain tool-calling — which this falls
      // back to — is unrestricted. Force it rather than let 'auto' try the
      // blocked feature first and fail the whole extraction.
      providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
    })

    return object
  } catch (err) {
    // If structured extraction fails (tool access, timeout, or provider
    // restrictions), fall back to a conservative synthetic extraction built
    // directly from the fetched source texts.
    console.error(`[extraction-fallback] brand="${brandName}" structured extraction failed, using synthesized fallback reason=${describeError(err)}`)
    return synthesizeExtractionFromFetchedSources(brandName, sources)
  }
}

// Synthesize a minimal BrandExtraction from fetched sources when the
// structured Anthropic extraction is unavailable. This creates conservative,
// evidence-grounded snippets directly from fetched page text without calling
// an LLM for extraction.
function synthesizeExtractionFromFetchedSources(brandName: string, sources: Map<string, SourceRecord>) {
  const fetched = [...sources.values()].filter((s) => s.fetched && s.text)
  const papers: Array<any> = []

  for (const s of fetched.slice(0, 12)) {
    const text = s.text ?? ''
    // Find a sentence containing the brand name or take the first sensible
    // 30-40 word window as a quote.
    const lcBrand = brandName.toLowerCase()
    const sentences = text.split(/(?<=[.!?])\s+/)
    let chosen = sentences.find((x) => x.toLowerCase().includes(lcBrand))
    if (!chosen) chosen = sentences.find((x) => x.trim().length > 40) || sentences[0] || text

    // Normalize whitespace and truncate to 40 words for the "quote".
    const words = chosen.replace(/\s+/g, ' ').trim().split(' ')
    const quoteWords = words.slice(0, 40)
    const quote = quoteWords.join(' ').trim()

    const summary = quote.slice(0, 300)

    let publisher = s.title ?? ''
    try {
      publisher = new URL(s.url).hostname.replace(/^www\./, '')
    } catch {
      // ignore
    }

    papers.push({
      title: s.title ?? publisher,
      publisher: publisher || 'unknown',
      year: undefined,
      sourceUrl: s.url,
      pdfUrl: undefined,
      independence: 'unclear',
      scope: 'brand-specific',
      topics: [],
      summary,
      findings: [
        {
          text: summary,
          quote,
        },
      ],
      safetyVerdict: 'unclear',
      sustainabilityVerdict: 'unclear',
    })
    if (papers.length >= 6) break
  }

  const overview = fetched.length > 0 ? `Found ${fetched.length} fetched sources; showing conservative snippets from the top results.` : ''

  return { overview, parentCompany: undefined, papers, legalMatters: [], claims: [] }
}

export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Strips a trailing search-disambiguation parenthetical (e.g. "ghd (Good Hair
// Day)" -> "ghd") so brand-mention checks compare against what a source would
// actually say, not our internal search variant.
function coreBrandToken(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// Anti-hallucination backstop for `scope`: a paper tagged brand-specific or
// parent-company MUST actually name that brand/company somewhere in the
// fetched text, or we don't trust the model's classification — sources like
// generic toxicology reviews or regulator committee homepages rank highly on
// brand-specific search queries without ever naming the brand.
export function sourceMentionsToken(token: string | undefined, sourceText: string | undefined): boolean {
  if (!token || !sourceText) return false
  const needle = normalizeForMatch(coreBrandToken(token))
  if (needle.length === 0) return false
  return normalizeForMatch(sourceText).includes(needle)
}

export function verifyQuote(quote: string, sourceText: string | undefined): QuoteVerification {
  if (!sourceText) return 'flagged'
  const needle = normalizeForMatch(quote)
  const haystack = normalizeForMatch(sourceText)
  if (needle.length === 0) return 'flagged'
  return haystack.includes(needle) ? 'verified' : 'flagged'
}

export function aggregateStatus(verdicts: Array<Verdict>): BrandStatus {
  if (verdicts.length === 0) return 'no-data'
  const counts: Record<Verdict, number> = { good: 0, concerning: 0, mixed: 0, unclear: 0 }
  for (const v of verdicts) counts[v]++
  const ranked = (Object.entries(counts) as Array<[Verdict, number]>).sort((a, b) => b[1] - a[1])
  const [topVerdict, topCount] = ranked[0]
  const tiedWithTop = ranked.filter(([, c]) => c === topCount)
  if (tiedWithTop.length > 1 && counts.good > 0 && counts.concerning > 0) return 'mixed'
  return topVerdict
}

// Only INDEPENDENT papers get a say in whether a brand's own claim holds up —
// a company's own pages can't corroborate its own claim. Keeps the source
// paper attached (not just the verdict) so callers can attribute a
// confirmed/contradicted/inconclusive result to the source(s) behind it.
function independentEvidenceForCategory(
  category: ClaimCategory,
  papers: Array<ResearchPaper>,
): Array<{ paper: ResearchPaper; verdict: Verdict }> {
  const independent = papers.filter((p) => p.independence === 'independent')
  if (category === 'safety') return independent.map((p) => ({ paper: p, verdict: p.safetyVerdict }))
  if (category === 'sustainability') return independent.map((p) => ({ paper: p, verdict: p.sustainabilityVerdict }))
  return independent.flatMap((p) => (p.otherVerdicts ?? []).filter((v) => v.category === category).map((v) => ({ paper: p, verdict: v.verdict })))
}

function isOtherCategory(category: ClaimCategory): category is OtherClaimCategory {
  return category === 'cruelty-free' || category === 'vegan' || category === 'labour-ethics' || category === 'quality'
}

function dedupePapers(evidence: Array<{ paper: ResearchPaper; verdict: Verdict }>): Array<{ publisher: string; sourceUrl: string }> {
  const seen = new Set<string>()
  const out: Array<{ publisher: string; sourceUrl: string }> = []
  for (const { paper } of evidence) {
    if (seen.has(paper.sourceUrl)) continue
    seen.add(paper.sourceUrl)
    out.push({ publisher: paper.publisher, sourceUrl: paper.sourceUrl })
  }
  return out
}

// Resolves a category to a match + source attribution from independent
// evidence alone (no company claim involved). Used both to score an
// explicit brand claim against the evidence, and to surface categories
// where independent sources have something to say even though the brand
// never made a public claim about it.
//
// Source attribution (checkedBy) is only trustworthy for the opt-in
// otherVerdicts categories (cruelty-free/vegan/labour-ethics) when the
// aggregate stays inconclusive: those verdicts are only ever set when a
// paper explicitly discusses that category. safety/sustainability verdicts
// are mandatory on every paper regardless of relevance, so an 'unclear'
// there could just be the model's default — but a resolved good/concerning
// is still a real signal worth attributing for any category.
function deriveCategoryResult(
  category: ClaimCategory,
  papers: Array<ResearchPaper>,
): { match: ClaimMatch; checkedBy?: Array<{ publisher: string; sourceUrl: string }> } {
  // Newest evidence first, and newer sources outweigh older ones (see recency.ts).
  const evidence = sortByRecency(
    independentEvidenceForCategory(category, papers).map((e) => ({ ...e, year: e.paper.year })),
  )
  const aggregate = weightedAggregateStatus(evidence, new Date().getFullYear())
  const match = matchFromAggregate(aggregate)

  if (match !== 'no-data') return { match, checkedBy: dedupePapers(evidence) }
  if (isOtherCategory(category) && evidence.length > 0) return { match: 'inconclusive', checkedBy: dedupePapers(evidence) }
  return { match: 'no-data' }
}

// good -> the claim is confirmed; concerning -> independent evidence
// contradicts it; mixed/unclear/no-data -> we can't say either way.
export function matchFromAggregate(aggregate: BrandStatus): ClaimMatch {
  if (aggregate === 'good') return 'confirmed'
  if (aggregate === 'concerning') return 'contradicted'
  return 'no-data'
}

async function postProcess(
  brandName: string,
  extraction: Awaited<ReturnType<typeof extractBrandData>>,
  sources: Map<string, SourceRecord>,
  meta: { sourcesConsulted: number; sourcesFetched: number; degraded: boolean },
  vertical: Vertical,
): Promise<BrandAnalysis> {
  const knownFetchedUrls = new Set([...sources.values()].filter((s) => s.fetched && s.text).map((s) => s.url))
  const parentCompany = extraction.parentCompany?.trim() || undefined

  const papers: Array<ResearchPaper> = []
  const seenPaperUrls = new Set<string>()

  for (const paper of extraction.papers) {
    if (paper.scope === 'sector-wide') continue // PRD 7.3: discard sector-wide entirely
    if (!knownFetchedUrls.has(paper.sourceUrl)) continue // anti-hallucination: must be a real fetched source
    if (seenPaperUrls.has(paper.sourceUrl)) continue

    const source = sources.get(paper.sourceUrl)
    // Anti-hallucination backstop: a source claimed as brand/parent-company
    // specific must actually name that brand/company in its fetched text —
    // otherwise the model likely mistook a high-ranking generic page (a
    // toxicology review, a regulator's committee homepage) for real evidence.
    const namesTheBrand = sourceMentionsToken(brandName, source?.text)
    const namesTheParent = paper.scope === 'parent-company' && sourceMentionsToken(parentCompany, source?.text)
    if (!namesTheBrand && !namesTheParent) continue

    seenPaperUrls.add(paper.sourceUrl)
    const findings: Array<Finding> = paper.findings.slice(0, 5).map((f: Finding) => ({
      ...f,
      quoteVerification: verifyQuote(f.quote, source?.text),
    }))

    const pdfUrl =
      paper.pdfUrl && (paper.pdfUrl === paper.sourceUrl || source?.linkedUrls.has(paper.pdfUrl))
        ? paper.pdfUrl
        : undefined

    papers.push({
      ...paper,
      pdfUrl,
      topics: paper.topics.slice(0, 6),
      findings,
    })
    if (papers.length >= 20) break
  }

  papers.splice(0, papers.length, ...sortByRecency(papers))

  const legalMatters: Array<LegalMatter> = []
  const seenLegalKeys = new Set<string>()

  for (const matter of extraction.legalMatters) {
    if (!knownFetchedUrls.has(matter.sourceUrl)) continue

    const source = sources.get(matter.sourceUrl)
    // Same anti-hallucination backstop as papers: the named entity must
    // actually appear in the fetched text.
    if (!sourceMentionsToken(matter.entity, source?.text) && !sourceMentionsToken(brandName, source?.text)) continue

    const key = `${matter.sourceUrl}::${matter.title}`
    if (seenLegalKeys.has(key)) continue
    seenLegalKeys.add(key)

    legalMatters.push({
      ...matter,
      quoteVerification: verifyQuote(matter.quote, source?.text),
    })
    if (legalMatters.length >= 8) break
  }

  const claims: Array<BrandClaim> = []
  const seenClaimCategories = new Set<ClaimCategory>()

  for (const claim of extraction.claims) {
    if (!knownFetchedUrls.has(claim.sourceUrl)) continue // anti-hallucination: must be a real fetched source
    if (seenClaimCategories.has(claim.category)) continue // one claim per category
    seenClaimCategories.add(claim.category)

    const source = sources.get(claim.sourceUrl)
    const { match, checkedBy } = deriveCategoryResult(claim.category, papers)

    claims.push({
      ...claim,
      quoteVerification: verifyQuote(claim.quote, source?.text),
      match,
      checkedBy,
    })
  }

  // Independent sources sometimes rate a category the brand never made a
  // public claim about at all (e.g. a cruelty-free tracker rating a brand
  // 'concerning' even though the brand's own site says nothing about animal
  // testing). Without this pass those findings were computed but silently
  // dropped — no BrandClaim entry meant no card in the UI, so a real
  // "concerning" verdict looked identical to "we found nothing."
  for (const category of VERTICAL_CATEGORIES[vertical]) {
    if (seenClaimCategories.has(category)) continue
    const { match, checkedBy } = deriveCategoryResult(category, papers)
    if (match === 'no-data') continue // genuinely nothing to show
    seenClaimCategories.add(category)
    claims.push({ category, match, checkedBy })
  }

  const hasEvidence =
    papers.length > 0 || legalMatters.length > 0 || claims.length > 0 || extraction.overview.trim().length > 0

  return {
    brand: brandName,
    parentCompany,
    overview: extraction.overview.trim(),
    hasEvidence,
    claims,
    papers,
    legalMatters,
    sourcesConsulted: meta.sourcesConsulted,
    sourcesFetched: meta.sourcesFetched,
    degraded: meta.degraded,
    // Distinguish "we couldn't reach anything" from "we fetched real pages
    // but found nothing brand-specific" — these have different causes and
    // telling them apart matters for whether "Try again" is likely to help.
    retrievalWarning:
      !hasEvidence && meta.degraded
        ? meta.sourcesFetched === 0
          ? 'Live evidence retrieval returned no accessible sources for this brand. The search provider may be unavailable or blocked for this key/model.'
          : `${meta.sourcesFetched} source(s) were fetched, but none contained brand-specific evidence for this brand. This may be a genuine lack of independent coverage, or an unlucky search pass — try again for a fresh search.`
        : undefined,
    generatedAt: new Date().toISOString(),
  }
}

// Retrieval (Firecrawl-primary) is typically fast; extraction now needs up to
// 60s for a full corpus (see the generateObject abortSignal above), so the
// overall budget has to comfortably cover both, not just retrieval.
const OVERALL_BUDGET_MS = 120_000

export async function researchBrand(brand: BrandCatalogEntry, opts?: { allowFirecrawl?: boolean }): Promise<BrandAnalysis> {
  const brandName = brand.searchName ?? brand.name
  const vertical: Vertical = brand.vertical ?? 'cosmetics'
  const startedAt = Date.now()

  // Firecrawl is metered and shared across the whole account, so it's opt-in
  // and OFF by default: a live visitor picking an uncached brand falls
  // straight to the free Claude-tools/DuckDuckGo chain (see
  // runTopicRetrieval), while the deliberate, rate-limited daily cache batch
  // (scripts/refresh-brand-cache.mjs) explicitly passes allowFirecrawl:
  // true. This keeps Firecrawl spend bounded by that batch size (2/day) —
  // it no longer scales with how many people click through brands live.
  const evidence = await collectBrandEvidence(brandName, vertical, opts?.allowFirecrawl ?? false)
  const remaining = OVERALL_BUDGET_MS - (Date.now() - startedAt)

  // Retrieval succeeding (sources actually fetched) but then extraction
  // getting skipped/failing must never collapse into a bare "no evidence"
  // result — that's indistinguishable from a genuine total retrieval
  // failure to the person reading the UI, and misattributes the problem
  // (see the fallback synthesis path, which is synchronous/near-instant and
  // safe to run even with almost no time budget left).
  let extraction: Awaited<ReturnType<typeof extractBrandData>>
  try {
    if (remaining < 5_000) {
      extraction = synthesizeExtractionFromFetchedSources(brandName, evidence.sources)
    } else {
      extraction = await extractBrandData(brandName, evidence.sources, vertical)
    }
  } catch {
    extraction = synthesizeExtractionFromFetchedSources(brandName, evidence.sources)
  }

  return postProcess(brandName, extraction, evidence.sources, {
    sourcesConsulted: evidence.sourcesConsulted,
    sourcesFetched: evidence.sourcesFetched,
    degraded: evidence.degraded || Date.now() - startedAt > OVERALL_BUDGET_MS,
  }, vertical)
}
