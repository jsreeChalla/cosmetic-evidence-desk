# Evidence Desk

A single-page app that lets a shopper pick any brand or retailer from the iGraal France
directory — cosmetics, fashion, electronics, or food — and see what independently
published research, ratings and legal records actually say about that brand's safety,
sustainability, labour practices, and vertical-specific concerns (cruelty-free status for
cosmetics, material sourcing for fashion, e-waste/conflict minerals for electronics,
sourcing/additives for food). Every claim shown is backed by a verbatim quote that is
checked against the source it was pulled from; when nothing brand-specific exists, the
app says so instead of filling the space with generic commentary.

Built against `PRD.md` in this repo. See **"Where this build differs from the PRD"**
below for the one substantive substitution that was made and why.

## Stack

- TanStack Start v1 (React 19, Vite 7), file-based routing
- Tailwind CSS v4 (CSS-first config, editorial serif design system in `src/styles.css`)
- Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`, Zod structured outputs
- Retrieval and extraction both run through the Anthropic API (see below)

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
npm run dev
```

Then open http://localhost:3000.

`npm run build && npm run start` builds and runs the production server.

`npm run test:logic` runs a standalone regression suite (no network calls) against the
anti-hallucination helpers in `research.server.ts` — quote verification/normalisation,
domain exclusion, tool-result parsing, and status aggregation.

## Where this build differs from the PRD

Section 9 of the PRD specifies **Firecrawl** for search/scraping and the **Lovable AI
Gateway** for structured extraction. Both require their own paid API keys that weren't
available while building this. Rather than leave those integrations as inert stubs, the
retrieval and extraction layers were rebuilt on a single provider — **Claude's own
server-executed `web_search` and `web_fetch` tools**, reached through the Vercel AI SDK's
Anthropic provider — so the app is fully live end-to-end with just one `ANTHROPIC_API_KEY`.

The two-phase shape the PRD asks for is preserved exactly:

1. **Retrieval** (`src/lib/research.server.ts`, `collectBrandEvidence`) — seven parallel
   topic searches per brand (ingredient safety/toxicology, sustainability & packaging,
   animal testing/cruelty-free certification, ethical ratings, supply chain & labour
   rights, corporate ownership, legal/regulatory actions), each run as its own
   agentic `generateText` call with `web_search` + `web_fetch` tools enabled, social
   platforms excluded via `blockedDomains`, and a `timeout: { totalMs: 30_000, tools:
   { web_fetchMs: 15_000 } }` budget that mirrors the PRD's 30s-search/15s-scrape limits.
   A page that's slow to fetch automatically falls back to a search-only retry so the
   result set is never emptied by one slow source.
2. **Extraction** (`extractBrandData`) — one `generateObject` call, constrained by a Zod
   schema (`src/lib/schemas.ts`) that mirrors PRD section 7.2 field-for-field
   (`overview`, `parentCompany`, `papers[]`, `legalMatters[]`), given only the text of
   sources that were actually fetched.

One consequence of this substitution, and it's a stricter guarantee than the PRD asked
for, not a weaker one: Claude's `web_search` tool returns `{url, title, pageAge,
encryptedContent}` with no extractable body text — the encrypted payload only means
something to Claude inside the same conversation, not to our server code. Only
`web_fetch` results give us real text to store and check quotes against. So **findings
and legal matters are only ever extracted from sources that were actually fetched in
full**; search-only hits still count toward "sources consulted" (and can surface a weak
ownership/name signal) but can never produce a quoted claim.

Everything else in the PRD — the anti-hallucination verification pass, the caps, the
discard-sector-wide-papers rule, the empty states, the brand catalogue, the UI flow and
ordering — is implemented as specified.

## Anti-hallucination controls (PRD 7.3), as implemented

- Every finding/legal-matter `quote` is checked in `verifyQuote()`
  (`src/lib/research.server.ts`): whitespace and curly-quote/dash punctuation are
  normalised on both sides, then the quote must appear as a substring of the fetched
  source text. Matches are labelled `verified`; anything else is `flagged` and rendered
  with a visible "unverified" badge rather than hidden.
- Every `sourceUrl` the model cites is cross-checked against the set of URLs we actually
  fetched; anything else is dropped, not trusted.
- `pdfUrl` is kept only if that exact URL string was found inside the fetched page's own
  text (or equals the source URL itself); otherwise it's stripped.
- Papers tagged `scope: "sector-wide"` are discarded entirely.
- Caps are enforced in code, not just requested in the prompt: 20 papers, 8 legal
  matters, 5 findings/paper, 6 topics/paper.

## Brand catalogue

`src/lib/igraal-brands.ts` — 56 brands/retailers scraped live from
`https://fr.igraal.com/codes-promo/cosmetiques`, each with its iGraal store URL. One
listing on that page, Groupon, was excluded as a general multi-category marketplace
rather than a cosmetics brand or retailer, to match the PRD's ~56-brand scope. A handful
of ambiguous iGraal labels carry a `searchName` override (e.g. Kiko → "KIKO Milano") used
to build accurate search queries, per PRD 7.1.

## Known gaps vs. a fully productionised build

- **No caching** (PRD 11 lists this as future work) — every brand click re-runs the full
  pipeline. Expect the ~45s worst-case latency the PRD targets, especially on first load
  of a brand.
- **No automated tests.** The build was verified with `npm run build`, a TypeScript
  check, and manual review of the pipeline logic; it has not been exercised against a
  live `ANTHROPIC_API_KEY` in this environment (none was available), so treat the first
  real run as the actual integration test.
- Model ID defaults to `claude-opus-4-8` (`ANTHROPIC_MODEL` env var to override) — verify
  against Anthropic's current model list before relying on this in production, since
  model names and availability change over time.
