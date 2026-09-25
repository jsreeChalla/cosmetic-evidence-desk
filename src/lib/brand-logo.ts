// Renders a brand's logo via Google's public favicon service, keyed off its
// official domain — no API key, no scraping/storage of actual logo assets
// (which would carry its own licensing questions for 56 brands). Callers
// should always pair this with an onError fallback (see BrandHeader/BrandChips)
// since a handful of domains won't have a usable favicon at every size.
export function brandLogoUrl(domain: string, size: 32 | 64 = 64): string {
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`
}
