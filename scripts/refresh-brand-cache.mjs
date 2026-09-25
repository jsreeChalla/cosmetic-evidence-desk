// Brand cache refresh — ONE FULL SWEEP OF THE CATALOGUE EVERY 90 DAYS.
//
// Safe to schedule daily (scripts/refresh-cache-daily.sh / crontab): unless a
// sweep is due, it just prints the next due date and exits — no searches, no
// AI calls, no Firecrawl credits. When due, it refreshes every brand (oldest
// cache first) and records the sweep, so the next one is 90 days later. If a
// run is interrupted, the next run resumes the same sweep.
//
// Uses the same logic and store as the Vercel Cron route
// (src/lib/cache-refresh.server.ts): MongoDB when MONGODB_URI is set,
// otherwise data/brand-cache/*.json (+ data/refresh-state.json).
// Firecrawl is used only while the account has credits; otherwise DuckDuckGo.
// A result weaker than the existing cache entry never overwrites it.
//
// Rebuild the bundle first whenever src/lib changes:  npm run refresh-cache:build
// Run:
//   set -a && source .env && set +a && node scripts/refresh-brand-cache.mjs [maxBrands|all] [concurrency] [--force] [--status]
//     maxBrands    brands per run while a sweep is active (default: all)
//     concurrency  brands researched in parallel (default: 1 — gentler on DuckDuckGo)
//     --force      start a new full sweep now, even if the last one was < 90 days ago
//     --status     only show the sweep state and next due date

import './_env-shim.mjs';

const { runSweep, getSweepStatus, cacheBackend, closeCacheStore, firecrawlRemainingCredits } = await import('./_bundled-refresh-entry.mjs');

const force = process.argv.includes('--force');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const maxBrands = Number(positional[0]) > 0 ? Number(positional[0]) : undefined; // undefined/"all" = whole sweep
const concurrency = Number(positional[1]) > 0 ? Number(positional[1]) : 1;

if (process.argv.includes('--status')) {
  const { state, nextSweepAt } = await getSweepStatus();
  console.log(JSON.stringify({ backend: cacheBackend(), ...state, nextSweepAt }, null, 2));
  await closeCacheStore();
  process.exit(0);
}

const credits = await firecrawlRemainingCredits();
console.log(
  `Cache backend: ${cacheBackend()}. Firecrawl credits: ${credits ?? 'unknown'} ` +
    `(${credits !== null && credits >= 100 ? 'will use Firecrawl' : 'using DuckDuckGo'}).`,
);

const startedAt = Date.now();
const report = await runSweep({ maxBrands, concurrency, force });
for (const r of report.results) console.log(`${r.outcome.padEnd(13)} ${r.brandId} (${r.seconds}s) — ${r.detail}`);
console.log(`\n[${report.status}] ${report.message}`);
if (report.results.length > 0) console.log(`Run took ${((Date.now() - startedAt) / 60_000).toFixed(1)} min.`);

await closeCacheStore();

const failed = report.results.filter((r) => r.outcome === 'failed');
if (failed.length > 0) {
  console.log(`Failed (not retried until the next sweep): ${failed.map((f) => f.brandId).join(', ')}`);
  process.exitCode = 1;
}
