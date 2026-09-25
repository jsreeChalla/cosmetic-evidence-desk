# PRD — Evidence Desk (formerly Reliability Check, originally Cosmetics Evidence Desk)

> This document describes the product as it is actually built and running today. The
> repo's original PRD.md (referenced throughout `research.server.ts` and `igraal-brands.ts`
> as "PRD section X") was lost before this document was written; section numbers below were
> chosen to match those existing in-code references rather than renumber the whole codebase's
> comment trail. Where behavior has evolved since the initial build (see §9), that's called
> out explicitly rather than silently retconned.

## 1. Problem

A shopper deciding whether to buy from a cosmetics brand has no fast way to check what
independent, published evidence actually says about that brand's safety, sustainability,
cruelty-free, vegan, or labour-ethics claims — vs. what the brand simply says about itself.
Brand marketing pages are not evidence. Sector-wide toxicology reviews and regulator
homepages that merely mention an ingredient are not brand-specific evidence either, but they
rank highly in a naive search and are easy to mistake for it.

## 2. Goals

- For any brand in the catalogue (§5), show what the brand itself publicly claims, and
  whether independently published sources (NGOs, watchdog/rating orgs, journalists,
  regulators, court records, toxicology/CSR analyses) confirm, contradict, or say nothing
  about that specific claim.
- Never fabricate or infer evidence. Every finding, legal matter, and claim shown must trace
  back to a verbatim quote from a source that was actually fetched, not the model's training
  knowledge or a plausible-sounding guess.
- Be explicit about absence of evidence. "No independent information available" and "no
  public claim was found" are legitimate, honestly-labelled outcomes — never silently
  hidden or filled in with generic sector commentary.
- Keep the whole pipeline running end-to-end on infrastructure a single developer can
  actually get access to (§9), without requiring every integration named in an earlier
  draft of this product to be available.

## 3. Non-goals

- Not a general product-safety or ingredient database. It never rates specific ingredients
  in isolation, only brand-level claims against brand-level (or named-parent-company-level)
  evidence.
- Not a real-time monitoring service. Evidence is refreshed periodically (§8), not on every
  page load, and the UI says how stale a result is rather than pretending it's live.
- Not a recommendation engine. It shows evidence; it does not tell the shopper what to buy.

## 4. Users

A shopper browsing iGraal France's cosmetics coupon directory who wants a quick,
evidence-backed gut check on a brand before buying — not a researcher who wants a
comprehensive literature review.

## 5. Brand catalogue

`src/lib/igraal-brands.ts` — 56 brands/retailers scraped from
`https://fr.igraal.com/codes-promo/cosmetiques` (iGraal France's cosmetics coupon
directory), each carrying its iGraal store URL. One listing on that page, "Groupon", was
excluded as a general multi-category marketplace rather than a cosmetics brand or retailer.
A handful of ambiguous iGraal labels carry a `searchName` override (e.g. Kiko → "KIKO
Milano", ghd → "ghd (Good Hair Day)") used to build accurate search queries and to
distinguish a brand from an unrelated same-named entity during evidence extraction (see the
`sourceMentionsToken` anti-hallucination guard in §7.3, and the Blissim vs. Bliss example it
was built to catch).

**Multi-vertical extension (post-rename to Reliability Check).** Three more verticals were
added on top of the original cosmetics-only catalogue, each with 3 brands sourced the same
way (from `fr.igraal.com`'s own category pages) and each carrying an explicit `vertical`
field on `BrandCatalogEntry` (`fashion`, `electronics`, `food`; cosmetics entries omit the
field and default to `'cosmetics'`): Adidas/Nike/H&M (fashion, from
`/codes-promo/modevetements`), Dell/HP/LG (electronics, from `/codes-promo/high-tech`), and
Lidl/HelloFresh/Carte Noire (food, from `/codes-promo/alimentation`). `ALL_RETAILER_BRANDS`
is the combined catalogue every server function/route now reads from;
`IGRAAL_COSMETICS_BRANDS` is kept as its own export for the cosmetics-only subset. See §6's
`VERTICAL_CATEGORIES` and §7.1's `VERTICAL_TOPICS` for how a brand's vertical changes which
claim categories and search topics apply to it.

## 6. Claim categories and matching semantics

Three categories are universal across every vertical: **safety**, **sustainability**,
**labour-ethics**. Each vertical then adds its own extension categories
(`VERTICAL_CATEGORIES`, `src/lib/schemas.ts`): cosmetics adds **cruelty-free**, **vegan**,
**quality**; fashion adds **material-sourcing**, **counterfeit-risk**; electronics adds
**e-waste-recyclability**, **conflict-minerals**, **data-privacy**; food adds
**sourcing-organic**, **additives-health**, **animal-welfare**. `postProcess`'s second pass
(§ below) and the extraction system prompt both key off a brand's vertical's category list
rather than one fixed set. For each category a brand *might* make a public claim about itself
(company-published sources only), and independent sources *might* have a verdict on it. The
UI renders one card per category with one of four states (`ClaimMatch`, `src/lib/schemas.ts`):

| State | Icon | Meaning |
|---|---|---|
| `confirmed` | ✅ | Independent evidence's aggregate verdict for this category is `good`. |
| `contradicted` | ❌ | Independent evidence's aggregate verdict is `concerning`. |
| `inconclusive` | ➖ (amber) | An independent source explicitly looked at this category but didn't reach a clear verdict (`mixed`/`unclear`) — different from no independent source existing at all. Only derivable for the opt-in categories (cruelty-free/vegan/labour-ethics), since their verdicts are only ever set when a source explicitly discusses them; safety/sustainability verdicts are mandatory on every extracted paper regardless of relevance, so an `unclear` there can't reliably be distinguished from "not discussed." |
| `no-data` | ➖ (slate) | No independent source addressed this category at all. |

A category card can exist even without a company-published claim to pair it against: if
independent sources have a verdict for a category the brand never made a public claim about
(e.g. a cruelty-free tracker rating a brand `concerning` even though the brand's own site
says nothing about animal testing), the card still renders — showing the independent
finding directly, with source attribution (`checkedBy`), rather than being silently dropped
because there was no brand claim to match it against. See `deriveCategoryResult` and the
second pass over `ALL_CLAIM_CATEGORIES` in `postProcess` (`research.server.ts`).

Only a paper whose `independence` is `"independent"` counts toward a category's aggregate —
a company's own page can never corroborate its own claim (`independentEvidenceForCategory`).

## 7. Evidence pipeline

### 7.1 Retrieval

Six universal topic searches (`CORE_TOPICS`) run for every brand regardless of vertical:
`brand-claims`, `sustainability-packaging`, `ethical-ratings`, `supply-chain`, `ownership`,
`legal-regulatory`. `searchTopicsFor(vertical)` appends 2-3 more from `VERTICAL_TOPICS`
(e.g. cosmetics adds `ingredient-safety`/`cruelty-free`/`product-quality`; electronics adds
`e-waste-recyclability`/`conflict-minerals`/`data-privacy`) — 8-9 topics total per brand,
run in parallel by `collectBrandEvidence`. Each topic resolves through a tiered fallback
chain, `runTopicRetrieval`:

1. **Firecrawl** (`/v2/search` with markdown scraping) — a single call returns full-page
   text for the top results. **Opt-in only**, via `researchBrand(brand, { allowFirecrawl:
   true })` — see §8 for why this isn't the default for live lookups.
2. **Claude's server-executed `web_search` + `web_fetch` tools** (via the Vercel AI SDK's
   Anthropic provider), with a 30s/15s search/fetch timeout budget and social platforms
   excluded via `blockedDomains`. Skipped entirely by default (`CLAUDE_WEB_TOOLS_BLOCKED`,
   defaults to blocked) since this tier is confirmed blocked outright by some deployments'
   org-level Vertex AI policy (`allowedPartnerModelFeatures` disallowing the
   `web_search`/`web_fetch` partner-model features) — set the env var to `"false"` once a
   given deployment's policy allows these features, to resume using this tier automatically.
3. **Claude `web_search`-only retry** — same policy caveat as above; kept for the same
   forward-compatibility reason.
4. **Keyless DuckDuckGo HTML scrape** (`duckDuckGoFallback`) — the last-resort, free path.
   No API key required, but fetch success is uneven (a single topic can return 4 URLs and
   successfully extract text from anywhere between 0 and 4 of them) and results are not
   pinned/reproducible between calls — the same brand queried twice can surface a
   meaningfully different source set. This is the tier that live lookups actually run
   through in practice today (§8, §10).

A source found via search but never successfully fetched (no body text) still counts toward
"sources consulted" and can weakly support an ownership/name signal, but can never produce a
quoted finding or claim — see §7.3.

Retrieval-tier fallbacks and their reasons are logged (`[retrieval-fallback]`,
`[retrieval-summary]` in `research.server.ts`) for diagnosing exactly which topics degraded
and why on a given run.

### 7.2 Extraction

One `generateObject` call per brand (`extractBrandData`), constrained by a Zod schema
(`BrandExtractionSchema`, `src/lib/schemas.ts`) covering `overview`, `parentCompany`,
`papers[]`, `legalMatters[]`, and `claims[]` — given only the text of sources that were
actually fetched (never search-only hits, never the model's own training knowledge). Runs
against the Anthropic API, reached via either a direct `ANTHROPIC_API_KEY` or an internal
Anthropic-compatible gateway (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`) — see §9. This
step is unaffected by the Vertex `web_search`/`web_fetch` policy block described in §7.1;
it's forced onto `structuredOutputMode: 'jsonTool'` instead of native structured outputs for
the same underlying org-policy reason (§9), not because it's blocked.

### 7.3 Anti-hallucination controls

- Every finding/legal-matter/claim `quote` is checked in `verifyQuote()`: whitespace and
  curly-quote/dash punctuation are normalised on both sides, then the quote must appear as a
  substring of the fetched source text. Matches are labelled `verified`; anything else is
  `flagged` and rendered with a visible "unverified" badge rather than hidden or discarded.
- A paper or legal matter tagged as brand-specific or parent-company-specific must have the
  brand's (or named parent's) name literally present in that source's fetched text
  (`sourceMentionsToken`) — a page that ranks highly on a brand-specific search query
  without ever naming the brand (a generic toxicology review, a regulator's committee
  homepage, or — concretely observed — an entirely different same-named brand like "Bliss"
  vs. "Blissim") is not trusted as evidence for that brand, regardless of what the
  extraction model classified it as.
- Every `sourceUrl` the model cites is cross-checked against the set of URLs actually
  fetched; anything else is dropped, not trusted.
- `pdfUrl` is kept only if that exact URL string was found inside the fetched page's own
  text (or equals the source URL itself); otherwise it's stripped.
- Papers tagged `scope: "sector-wide"` (discusses the cosmetics industry/an ingredient/a
  regulatory topic generically, without the brand or its named parent appearing verbatim in
  the source text) are discarded entirely, never shown.
- Caps are enforced in code, not just requested in the prompt: 20 papers, 8 legal matters, 5
  findings/paper, 6 topics/paper, at most one claim per category.
- `publisher` must name the actual organization behind a source, not just its bare domain,
  whenever the source text identifies it. `fundingDisclosure` is only ever set when the
  source text explicitly states who funded/sponsored the work (or explicitly states there
  was none) — never inferred or guessed, which matters most when `independence` is
  `"unclear"`.

### 7.4 Failure handling

A slow or failed fetch never empties the result set for that topic — see the fallback chain
in §7.1. If structured extraction itself fails (timeout, provider error), the pipeline falls
back to a conservative, LLM-free synthesis built directly from whatever fetched source text
exists (`synthesizeExtractionFromFetchedSources`) rather than fabricating structured claims.
If a brand has zero fetched sources at all, extraction is skipped entirely and an honest
empty result is returned. A result that came back with genuinely nothing to show
(`hasEvidence: false`) plus a degraded retrieval run surfaces an explicit
`retrievalWarning` in the UI rather than a bare empty state.

## 8. Caching and cost controls

**Cache.** One flat-file JSON per brand (`data/brand-cache/<id>.json`,
`src/lib/brand-cache.server.ts`) — no SQL database, since the underlying data is static text
that changes slowly. `CACHE_MAX_AGE_MS` = 90 days. A live lookup (`getBrandResearch`,
`research.functions.ts`) serves a fresh cache entry instantly with zero retrieval calls; on a
miss or staleness it runs the live pipeline and writes the result back, falling back to a
stale cache entry (rather than a hard error) if the live run itself fails.

**Firecrawl is metered and opt-in, off by default.** `researchBrand(brand, opts?: {
allowFirecrawl?: boolean })` defaults to `false`. Live user-facing lookups never spend
Firecrawl credits — they run the free Claude-tools/DuckDuckGo chain (§7.1). The **only**
place in the app that spends Firecrawl credits is `scripts/refresh-brand-cache.mjs`, a daily
batch job (`{ allowFirecrawl: true }`) that:
- Skips any brand whose cache entry is still fresh (< 90 days).
- Only refreshes up to `batchSize` brands per run (default 2/day, tunable via CLI args).
- Is meant to run on a schedule (cron/launchd), or manually — re-running it daily naturally
  spreads a full 56-brand catalog sweep over several weeks instead of spending the whole
  credit budget in one sitting, keeping Firecrawl spend bounded by batch size rather than by
  how many people click through brands live.

**Tradeoff this creates**, tracked as a known limitation (§10): an uncached (or
90-day-stale) brand's live lookup depends entirely on DuckDuckGo, whose search results and
fetch success are not reproducible between calls. A single live "no independent information
available" result for such a brand is not fully trustworthy — it can mean either "genuinely
nothing exists" or "this particular DuckDuckGo pass didn't surface it." Concretely observed
on Dr Pierre Ricaud: one live run returned zero independent papers; a later run (same 90-day
cache window, re-triggered) returned two solid ones (a CSR rating and a product analysis)
that the first run's search queries simply hadn't surfaced. The Firecrawl-backed daily batch
is the more reliable source of truth; live/free lookups are best-effort.

## 9. Provider architecture

Retrieval and extraction both ultimately depend on the Anthropic API, reached one of two
ways:
- A direct Anthropic Console `ANTHROPIC_API_KEY` (`x-api-key` auth), **or**
- An internal Anthropic-compatible gateway: `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`
  (Bearer auth) — the gateway's base URL must include its own `/v1` path segment, since the
  Vercel AI SDK's Anthropic provider only auto-appends `/v1` to its own default
  `api.anthropic.com` host, not to a custom `ANTHROPIC_BASE_URL`.

`ANTHROPIC_MODEL` is passed through verbatim to a custom gateway (including any routing
prefix it expects, e.g. `vertex_ai/claude-opus-4-8`) rather than validated/aliased, since a
gateway-side model ID isn't necessarily a real Anthropic Console model name.

**Known org-policy constraint** (observed, not assumed): when the gateway routes through
Google Cloud Vertex AI, the org-level `constraints/vertexai.allowedPartnerModelFeatures`
policy can block specific partner-model features outright, independent of application code.
Confirmed blocked in this deployment: `web_search`/`web_fetch` (server-executed tools — no
code-level workaround exists, since these are Anthropic-hosted tools; see §7.1's
`CLAUDE_WEB_TOOLS_BLOCKED` skip) and `structured_outputs` (worked around via
`providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } }`, which routes through
ordinary tool-calling instead — unrestricted by the same policy).

Retrieval's third-party dependency, when Firecrawl is allowed (§8): a single
`POST /v2/search` call with `scrapeOptions: { formats: ['markdown'] }` returns both search
results and full-page markdown for each in one request, avoiding a separate scrape round
trip per URL.

## 10. Known limitations

- **Live-lookup retrieval isn't reproducible.** See §8 — an uncached brand's "no data" result
  from a single DuckDuckGo-only run isn't a reliable signal that no evidence exists.
- **Claude's `web_search`/`web_fetch` tools are non-functional in a Vertex-routed
  deployment** until an org lifts the relevant policy constraint (§9). The pipeline degrades
  gracefully around this (§7.1), but it means two of the four retrieval tiers are dead
  weight in that environment.
- **No SQL database, by design** (§8) — acceptable because the underlying corpus is small
  (56 brands) and slow-changing; would need revisiting if the catalogue or refresh frequency
  grew substantially.
- **Local-dev-only deployment.** The daily cache-refresh batch currently depends on someone
  (or an OS-level cron/launchd job, or a live chat session) actually triggering it; there is
  no hosted scheduler.
- **Extraction latency.** A full corpus (up to 16 full-text sources capped in
  `buildCorpus`) can take up to the full extraction timeout to process, especially under the
  `jsonTool` structured-output workaround, which is measurably slower than native structured
  output for a schema this size.

## 11. Future work

- Automatic retry (or a second-opinion re-query) when a live lookup returns zero independent
  papers on a `degraded` run, to catch the false-negative case in §8/§10 without waiting for
  the next scheduled batch.
- Prioritize the daily batch toward brands that have *never* completed a Firecrawl-backed
  pass, ahead of brands merely due for a routine refresh, so more of the catalogue reaches a
  reliable baseline sooner.
- A real hosted scheduler for the cache-refresh batch, if/when this moves beyond local dev.
- Revisit the flat-file cache if the brand catalogue or refresh cadence grows enough to
  warrant an actual database.
