import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, useCallback, useEffect } from 'react'
import { ALL_RETAILER_BRANDS } from '~/lib/igraal-brands'
import { getBrandResearch, type BrandResearchResponse } from '~/lib/research.functions'
import { getFeaturedBrands, type FeaturedBrandsResponse } from '~/lib/featured-brands.functions'
import { BrandChips } from '~/components/BrandChips'
import { BrandHeader } from '~/components/BrandHeader'
import { ClaimCard } from '~/components/ClaimCard'
import type { ClaimCategory } from '~/lib/schemas'
import { ExplanationSection } from '~/components/ExplanationSection'
import { ReadMoreSection } from '~/components/ReadMoreSection'
import { EmptyState } from '~/components/EmptyState'
import { LoadingState } from '~/components/LoadingState'
import { SustainabilityScoreBadge, SCRAPED_NOTICE } from '~/components/SustainabilityScoreBadge'
import { computeSustainabilityScore } from '~/lib/sustainability-score'
import { Hero } from '~/components/Hero'
import { CategoryBanner } from '~/components/CategoryBanner'

const FEATURED_ROWS: Array<{ category: ClaimCategory; title: string; description: string }> = [
  { category: 'sustainability', title: 'Sustainable brands', description: 'Independently confirmed environmental practices.' },
  { category: 'vegan', title: 'Vegan brands', description: 'Independently confirmed to use no animal-derived ingredients.' },
  { category: 'cruelty-free', title: 'Cruelty-free brands', description: 'Independently confirmed to not test on animals.' },
  { category: 'labour-ethics', title: 'Ethical brands', description: 'Independently confirmed fair labour & supply chain practices.' },
  { category: 'quality', title: 'High quality brands', description: 'Independently confirmed product performance & efficacy.' },
]

export const Route = createFileRoute('/')({
  component: HomePage,
})

const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  safety: 'Safety',
  sustainability: 'Sustainability',
  'cruelty-free': 'Cruelty-free',
  vegan: 'Vegan',
  'labour-ethics': 'Labour & supply chain ethics',
  quality: 'Product quality',
  'material-sourcing': 'Material sourcing',
  'counterfeit-risk': 'Counterfeit risk',
  'e-waste-recyclability': 'E-waste & recyclability',
  'conflict-minerals': 'Conflict minerals',
  'data-privacy': 'Data privacy',
  'sourcing-organic': 'Ingredient sourcing',
  'additives-health': 'Additives & health',
  'animal-welfare': 'Animal welfare',
}

type ViewState =
  | { status: 'idle' }
  | { status: 'loading'; brandId: string }
  | { status: 'done'; brandId: string; result: BrandResearchResponse }

function InfoNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="note"
      className="relative mx-auto mb-10 max-w-prose rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 pr-9 text-sm text-slate-600 shadow-sm"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss note"
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full after:absolute after:-inset-3 after:content-[''] text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none"
      >
        ×
      </button>
      Brand safety, sustainability, and labour claims, checked against independent
      research and records. <span className="font-medium text-emerald-600">✓ backed up</span> ·{' '}
      <span className="font-medium text-red-600">✗ contradicted</span> ·{' '}
      <span className="font-medium text-slate-400">– no independent data</span>. Every finding is a
      verbatim, source-checked quote.
    </div>
  )
}

function HomePage() {
  const [view, setView] = useState<ViewState>({ status: 'idle' })
  const [showInfoNote, setShowInfoNote] = useState(true)
  const [featured, setFeatured] = useState<FeaturedBrandsResponse | null>(null)
  const getBrandResearchFn = useServerFn(getBrandResearch)
  const getFeaturedBrandsFn = useServerFn(getFeaturedBrands)

  useEffect(() => {
    void getFeaturedBrandsFn().then(setFeatured).catch(() => {})
  }, [getFeaturedBrandsFn])

  const selectedId =
    view.status === 'loading' ? view.brandId : view.status === 'done' ? view.brandId : null

  const runResearch = useCallback(
    async (brandId: string) => {
      setView({ status: 'loading', brandId })
      try {
        const result = await getBrandResearchFn({ data: { brandId } })
        setView({ status: 'done', brandId, result })
      } catch (err) {
        setView({
          status: 'done',
          brandId,
          result: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Evidence retrieval failed unexpectedly.',
          },
        })
      }
    },
    [getBrandResearchFn],
  )

  // Phones/tablets: the 65-brand directory is collapsed behind a "Change brand"
  // button instead of being stacked above the result.
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSelect = useCallback(
    (brandId: string) => {
      setPickerOpen(false)
      void runResearch(brandId)
    },
    [runResearch],
  )

  const selectedBrand = selectedId
    ? ALL_RETAILER_BRANDS.find((b) => b.id === selectedId)
    : undefined

  // Picking a brand (from the home page or the directory list, often far down
  // the page) replaces the content but keeps the scroll position, so the result
  // would load out of sight. Scroll to the top on every new selection: on
  // desktop the result sits beside the sticky list, and on phones/tablets it
  // sits right under the compact "Change brand" bar.
  useEffect(() => {
    if (!selectedId) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }))
    return () => cancelAnimationFrame(frame)
    // Runs on selection (loading) and again once the result has rendered.
  }, [selectedId, view.status])

  if (!selectedBrand) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          Evidence Desk
        </div>

        <Hero
          checkedCount={featured?.checkedCount ?? 0}
          independentCount={featured?.independentCount ?? 0}
          totalCount={featured?.totalCount ?? ALL_RETAILER_BRANDS.length}
        />

        {showInfoNote && (
          <div className="mt-8">
            <InfoNote onDismiss={() => setShowInfoNote(false)} />
          </div>
        )}

        {featured && (
          <div className="mt-8 space-y-4">
            {FEATURED_ROWS.map((row) => (
              <CategoryBanner
                key={row.category}
                category={row.category}
                title={row.title}
                description={row.description}
                brands={featured.groups[row.category]}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        <section aria-label="Browse all brands" className="mt-10 border-t border-hairline pt-8">
          <h2 className="text-xl">Browse all brands</h2>
          <p className="mt-1 text-sm text-slate-500">Every brand & retailer across the iGraal France catalogue we cover — cosmetics, fashion, electronics, and food.</p>
          <div className="mt-4">
            <BrandChips brands={ALL_RETAILER_BRANDS} selectedId={selectedId} onSelect={handleSelect} layout="row" />
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-start">
        <section aria-label="Brand directory" className="lg:sticky lg:top-8">
          {/* Phones/tablets: compact bar, full list on demand */}
          <div className="lg:hidden">
            <MobileBrandPicker
              selectedBrand={selectedBrand}
              open={pickerOpen}
              onToggle={() => setPickerOpen((v) => !v)}
              onSelect={handleSelect}
            />
          </div>
          {/* Desktop: full list beside the result */}
          <div className="hidden lg:block">
            <BrandChips brands={ALL_RETAILER_BRANDS} selectedId={selectedId} onSelect={handleSelect} layout="column" />
          </div>
        </section>

        <section aria-live="polite" className="border-t border-hairline pt-6 lg:border-t-0 lg:pt-0">
          {view.status === 'loading' && <LoadingState brandName={selectedBrand.name} />}

          {view.status === 'done' && (
            <BrandResult brand={selectedBrand} result={view.result} onRetry={() => runResearch(selectedBrand.id)} />
          )}
        </section>
      </div>
    </main>
  )
}

function MobileBrandPicker(props: {
  selectedBrand: (typeof ALL_RETAILER_BRANDS)[number]
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  const { selectedBrand, open, onToggle, onSelect } = props
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q ? ALL_RETAILER_BRANDS.filter((b) => b.name.toLowerCase().includes(q)) : ALL_RETAILER_BRANDS

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-white px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">Viewing</div>
          <div className="truncate font-medium text-ink">{selectedBrand.name}</div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="mobile-brand-list"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {open ? 'Close' : 'Change brand'}
          <span aria-hidden="true" className={'inline-block transition-transform ' + (open ? 'rotate-180' : '')}>▾</span>
        </button>
      </div>

      {open && (
        <div id="mobile-brand-list" className="mt-3 rounded-lg border border-hairline bg-white p-3 shadow-sm">
          <label className="sr-only" htmlFor="mobile-brand-search">
            Search brands
          </label>
          <input
            id="mobile-brand-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ALL_RETAILER_BRANDS.length} brands`}
            autoComplete="off"
            className="mb-3 min-h-11 w-full rounded-md border border-slate-300 px-3 text-base focus:border-slate-500 focus:outline-none"
          />
          {matches.length > 0 ? (
            <BrandChips brands={matches} selectedId={selectedBrand.id} onSelect={onSelect} layout="row" />
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">No brands match “{query}”.</p>
          )}
        </div>
      )}
    </div>
  )
}

function BrandResult({
  brand,
  result,
  onRetry,
}: {
  brand: (typeof ALL_RETAILER_BRANDS)[number]
  result: BrandResearchResponse
  onRetry: () => void
}) {
  if (result.status === 'unknown-brand') {
    return <EmptyState brandName={brand.name} reason="error" message="Unknown brand." onRetry={onRetry} />
  }

  if (result.status === 'config-error') {
    return <EmptyState brandName={brand.name} reason="config-error" message={result.message} />
  }

  if (result.status === 'error') {
    return <EmptyState brandName={brand.name} reason="error" message={result.message} onRetry={onRetry} />
  }

  const { data } = result
  const claimByCategory = new Map(data.claims.map((c) => [c.category, c]))
  const extraCategories = [...claimByCategory.keys()].filter(
    (category) => category !== 'safety' && category !== 'sustainability',
  )

  if (!data.hasEvidence) {
    if (data.degraded) {
      return (
        <EmptyState
          brandName={brand.name}
          reason="error"
          message={data.retrievalWarning ?? 'Live evidence retrieval returned no accessible sources for this brand.'}
          onRetry={onRetry}
        />
      )
    }

    return <EmptyState brandName={brand.name} reason="no-data" />
  }

  const sustainabilityScore = computeSustainabilityScore(data, brand.vertical ?? 'cosmetics', brand.id)

  return (
    <div className="space-y-8">
      <BrandHeader brand={brand} parentCompany={data.parentCompany} claims={data.claims} />

      <ExplanationSection overview={data.overview} />

      {sustainabilityScore && <SustainabilityScoreBadge score={sustainabilityScore} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ClaimCard label="Safety" category="safety" claim={claimByCategory.get('safety')} />
        <ClaimCard label="Sustainability" category="sustainability" claim={claimByCategory.get('sustainability')} />
        {extraCategories.map((category) => (
          <ClaimCard key={category} label={CATEGORY_LABELS[category]} category={category} claim={claimByCategory.get(category)} />
        ))}
      </div>

      <ReadMoreSection legalMatters={data.legalMatters} papers={data.papers} />

      <p className="text-xs text-slate-500">{SCRAPED_NOTICE}</p>

      <p className="text-xs text-slate-400">
        {data.sourcesFetched} of {data.sourcesConsulted} sources consulted were fully read. Evidence as of{' '}
        {new Date(data.generatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.
        {data.degraded ? ' Some searches were slower than expected; this result may be based on partial evidence.' : ''}
      </p>
    </div>
  )
}
