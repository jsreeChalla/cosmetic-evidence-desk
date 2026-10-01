// One-off / occasional: adds publication dates to the committed cache files
// (data/brand-cache/*.json) from each source page's own metadata — no AI, no
// Firecrawl credits. Keeps each entry's cachedAt. Safe to re-run; already-dated
// items are skipped. New research results get dates automatically.
//
// Once the updated files are committed and deployed, the app replaces any
// older seed-derived copies in MongoDB on their own (see writeSeedBrandCache).
//
//   npm run refresh-cache:build
//   node scripts/backfill-source-dates.mjs [--from N] [--to M]   # brand index range, default all

import './_env-shim.mjs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const { addSourceDates } = await import('./_bundled-refresh-entry.mjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const dir = join(process.cwd(), 'data', 'brand-cache');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
const slice = files.slice(arg('--from', 0), arg('--to', files.length));

let urls = 0, dated = 0;
for (const f of slice) {
  const path = join(dir, f);
  const entry = JSON.parse(await readFile(path, 'utf-8'));
  const r = await addSourceDates(entry.data, { concurrency: 8, timeoutMs: 10_000, budgetMs: 120_000 });
  urls += r.urls; dated += r.dated;
  if (r.dated > 0) await writeFile(path, JSON.stringify(entry, null, 2), 'utf-8');
  console.log(`${f.replace('.json', '').padEnd(24)} ${r.dated}/${r.urls} source pages dated`);
}
console.log(`\n${dated}/${urls} undated source pages now have a date (the rest state none in their metadata).`);
