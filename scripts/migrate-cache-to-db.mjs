// One-off: copies every data/brand-cache/<id>.json (and data/refresh-state.json,
// if present) into MongoDB, keeping each entry's original cachedAt so the
// refresh schedule is unchanged. Safe to re-run (each brand is an upsert).
//
//   npm run refresh-cache:build
//   set -a && source .env && source .env.local && set +a     # .env.local from `npx vercel env pull`
//   node scripts/migrate-cache-to-db.mjs [--dry-run]
//
// Needs MONGODB_URI (set by the MongoDB Atlas Vercel integration).

import './_env-shim.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set — nothing to migrate into. Run `npx vercel env pull .env.local` and source it first.');
  process.exit(1);
}

const { writeBrandCache, writeRefreshState, listBrandCache, closeCacheStore } = await import('./_bundled-refresh-entry.mjs');
const dir = join(process.cwd(), 'data', 'brand-cache');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
const dbName = process.env.MONGODB_DB || 'reliability-check';
console.log(`${files.length} cache files → MongoDB database "${dbName}", collection brand_cache${dryRun ? ' [dry run]' : ''}`);

let ok = 0;
const failed = [];
for (const f of files) {
  const brandId = f.slice(0, -'.json'.length);
  try {
    const { cachedAt, data } = JSON.parse(await readFile(join(dir, f), 'utf-8'));
    if (!cachedAt || !data) throw new Error('missing cachedAt/data');
    if (!dryRun) await writeBrandCache(brandId, data, cachedAt);
    ok++;
    console.log(`ok   ${brandId} (cachedAt ${cachedAt})`);
  } catch (err) {
    failed.push(brandId);
    console.error(`FAIL ${brandId} — ${err?.message ?? err}`);
  }
}

// Carry over the 90-day sweep schedule, if a local state file exists.
try {
  const state = JSON.parse(await readFile(join(process.cwd(), 'data', 'refresh-state.json'), 'utf-8'));
  if (!dryRun) await writeRefreshState(state);
  console.log(`sweep state copied (last sweep started ${state.lastSweepStartedAt ?? 'never'})`);
} catch {
  console.log('no local sweep state — the schedule will start from the oldest cache entry');
}

if (!dryRun) {
  console.log(`\nWrote ${ok}/${files.length}. Database now holds ${(await listBrandCache()).length} brand(s).`);
} else {
  console.log(`\nDry run: ${ok}/${files.length} files are valid.`);
}
await closeCacheStore();
if (failed.length) {
  console.log(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
