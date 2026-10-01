import type { BrandAnalysis } from './schemas'
import { latestYear } from './dates'

/**
 * Finds when a source page was published, from the page's OWN machine-readable
 * metadata only — schema.org JSON-LD (datePublished / dateModified), standard
 * meta tags (article:published_time, citation_publication_date, DC dates, …)
 * and <time itemprop="datePublished">. Nothing is inferred from body text or
 * HTTP headers, so a missing date stays missing ("Date not stated").
 *
 * No AI and no Firecrawl credits: a plain HTTP GET per source URL.
 */

export interface SourceDate {
  published?: string // YYYY-MM-DD
  updated?: string // YYYY-MM-DD
  via: string // which metadata fields they came from
}

const PUBLISHED_META = [
  'article:published_time',
  'og:article:published_time',
  'datepublished',
  'pubdate',
  'publishdate',
  'publish-date',
  'publish_date',
  'dc.date.issued',
  'dcterms.issued',
  'dc.date',
  'dcterms.date',
  'citation_publication_date',
  'citation_date',
  'citation_online_date',
  'parsely-pub-date',
  'sailthru.date',
  'date',
]
const UPDATED_META = ['article:modified_time', 'og:updated_time', 'datemodified', 'dcterms.modified', 'last-modified', 'lastmod']

function normalise(raw: string | undefined | null, now = Date.now()): string | undefined {
  if (!raw) return undefined
  const s = String(raw).trim()
  // Accept ISO-like dates (2024-03-12, 2024-03-12T10:00:00Z, 2024/03/12) and plain years/months.
  const m = s.match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?/)
  if (!m) {
    const t = Date.parse(s) // e.g. "Tue, 12 Mar 2024 10:00:00 GMT"
    if (Number.isNaN(t)) return undefined
    return normalise(new Date(t).toISOString().slice(0, 10), now)
  }
  const y = Number(m[1])
  const mo = m[2] ? Number(m[2]) : undefined
  const d = m[3] ? Number(m[3]) : undefined
  if (y < 1995 || (mo !== undefined && (mo < 1 || mo > 12)) || (d !== undefined && (d < 1 || d > 31))) return undefined
  const iso = [String(y), mo ? String(mo).padStart(2, '0') : undefined, d ? String(d).padStart(2, '0') : undefined]
    .filter(Boolean)
    .join('-')
  const ts = Date.parse(mo ? `${y}-${String(mo).padStart(2, '0')}-${String(d ?? 1).padStart(2, '0')}` : `${y}-01-01`)
  if (Number.isNaN(ts) || ts > now + 2 * 86_400_000) return undefined // no future dates
  return iso
}

function walkJsonLd(node: unknown, out: { published?: string; updated?: string }) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out))
    return
  }
  const obj = node as Record<string, unknown>
  if (!out.published && typeof obj.datePublished === 'string') out.published = obj.datePublished
  if (!out.updated && typeof obj.dateModified === 'string') out.updated = obj.dateModified
  if (obj['@graph']) walkJsonLd(obj['@graph'], out)
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined
}

export function extractDateFromHtml(html: string): SourceDate | undefined {
  // schema.org JSON-LD
  const ld: { published?: string; updated?: string } = {}
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkJsonLd(JSON.parse(m[1].trim()), ld)
    } catch {
      // ignore malformed JSON-LD
    }
  }
  // meta tags
  const metas = new Map<string, string>()
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? attr(m[0], 'itemprop') ?? '').toLowerCase()
    const content = attr(m[0], 'content')
    if (key && content && !metas.has(key)) metas.set(key, content)
  }
  // <time itemprop="datePublished|dateModified" datetime="…">
  const timeTags: Record<string, string> = {}
  for (const m of html.matchAll(/<time\b[^>]*>/gi)) {
    const prop = (attr(m[0], 'itemprop') ?? '').toLowerCase()
    const dt = attr(m[0], 'datetime')
    if (dt && (prop === 'datepublished' || prop === 'datemodified') && !timeTags[prop]) timeTags[prop] = dt
  }

  const out: SourceDate = { via: '' }
  const via: Array<string> = []
  const take = (field: 'published' | 'updated', raw: string | undefined, label: string) => {
    if (out[field]) return
    const d = normalise(raw)
    if (d) {
      out[field] = d
      via.push(label)
    }
  }
  take('published', ld.published, 'json-ld datePublished')
  for (const key of PUBLISHED_META) take('published', metas.get(key), `meta ${key}`)
  take('published', timeTags.datepublished, 'time datePublished')
  take('updated', ld.updated, 'json-ld dateModified')
  for (const key of UPDATED_META) take('updated', metas.get(key), `meta ${key}`)
  take('updated', timeTags.datemodified, 'time dateModified')

  // An "updated" date before the publication date is meaningless.
  if (out.updated && out.published && out.updated < out.published) delete out.updated
  if (!out.published && !out.updated) return undefined
  out.via = via.join(', ')
  return out
}

export async function fetchSourceDate(url: string, timeoutMs = 10_000): Promise<SourceDate | undefined> {
  if (/\.pdf($|\?)/i.test(url)) return undefined // PDFs: no HTML metadata to read
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return undefined
    // Metadata lives in <head>; cap how much we read.
    const html = (await res.text()).slice(0, 600_000)
    return extractDateFromHtml(html)
  } catch {
    return undefined
  }
}

/**
 * Adds publishedDate/updatedDate to every paper, legal matter, brand claim and
 * "checked by" reference in a brand result that has neither yet (in place).
 * Fills `year` from the most recent stated date when the source text gave no
 * year. Returns how many unique source URLs got a date.
 */
export async function addSourceDates(
  data: BrandAnalysis,
  opts: { concurrency?: number; timeoutMs?: number; budgetMs?: number } = {},
): Promise<{ urls: number; dated: number }> {
  const undated = (x: { publishedDate?: string; updatedDate?: string }) => !x.publishedDate && !x.updatedDate
  const urls = new Set<string>()
  for (const p of data.papers) if (undated(p)) urls.add(p.sourceUrl)
  for (const m of data.legalMatters) if (undated(m)) urls.add(m.sourceUrl)
  for (const c of data.claims) if (c.sourceUrl && undated(c)) urls.add(c.sourceUrl)

  const found = new Map<string, SourceDate>()
  const list = [...urls]
  const deadline = Date.now() + (opts.budgetMs ?? 60_000)
  let next = 0
  async function worker() {
    while (next < list.length && Date.now() < deadline) {
      const url = list[next++]
      const d = await fetchSourceDate(url, opts.timeoutMs)
      if (d) found.set(url, d)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, list.length) }, worker))

  const apply = <T extends { publishedDate?: string; updatedDate?: string; year?: number }>(item: T, url: string | undefined) => {
    const d = url ? found.get(url) : undefined
    if (!d || !undated(item)) return
    if (d.published) item.publishedDate = d.published
    if (d.updated) item.updatedDate = d.updated
    // Recency uses the most recent stated date (a living rating page updated
    // in 2025 reflects 2025 knowledge) — only when the source text gave no year.
    if (!item.year) item.year = latestYear(item)
  }
  for (const p of data.papers) apply(p, p.sourceUrl)
  for (const m of data.legalMatters) apply(m, m.sourceUrl)
  for (const c of data.claims) apply(c, c.sourceUrl)

  // "Checked by" references point at papers — copy each paper's dates onto them.
  const byUrl = new Map(data.papers.map((p) => [p.sourceUrl, p]))
  for (const c of data.claims) {
    for (const ref of c.checkedBy ?? []) {
      const p = byUrl.get(ref.sourceUrl)
      if (p && undated(ref) && (p.publishedDate || p.updatedDate || p.year)) {
        ref.publishedDate = p.publishedDate
        ref.updatedDate = p.updatedDate
        ref.year = p.year
      }
    }
  }
  return { urls: list.length, dated: found.size }
}
