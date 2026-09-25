// Manual single-brand smoke test against the live pipeline. Shares the same
// bundle as refresh-brand-cache.mjs (scripts/_bundled-refresh-entry.mjs) so
// there's only one build step to remember — rebuild it first whenever
// research.server.ts, schemas.ts, or igraal-brands.ts change:
//   npm run refresh-cache:build
//
// Run with: node scripts/run-research.mjs
import './_env-shim.mjs';

(async () => {
  try {
    const { researchBrand } = await import('./_bundled-refresh-entry.mjs');
    const brand = { id: 'beauty-success', name: 'Beauty success', storeUrl: 'https://fr.igraal.com/codes-promo/beauty-success' };
    const data = await researchBrand(brand);
    console.log(JSON.stringify({
      brand: data.brand,
      hasEvidence: data.hasEvidence,
      sourcesConsulted: data.sourcesConsulted,
      sourcesFetched: data.sourcesFetched,
      degraded: data.degraded,
      retrievalWarning: data.retrievalWarning,
      papers: data.papers.length,
      legalMatters: data.legalMatters.length,
    }, null, 2));
  } catch (err) {
    console.error('research run error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
