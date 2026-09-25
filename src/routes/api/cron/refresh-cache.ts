import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { getSweepStatus, refreshBrands, runSweep, selectBrandsToRefresh } from '~/lib/cache-refresh.server'

/**
 * GET /api/cron/refresh-cache — called daily by Vercel Cron (schedule in
 * vite.config.ts). The catalogue is refreshed in one full sweep every 90 days
 * (see cache-refresh.server.ts): on most days this call only reads the sweep
 * state and returns "not-due" without any research. While a sweep is running,
 * each call refreshes the next REFRESH_BATCH_SIZE brands.
 *
 * Protected by CRON_SECRET: Vercel sends "Authorization: Bearer <CRON_SECRET>".
 *
 * Manual use (same header):
 *   ?status=1              show sweep state and the next due date
 *   ?brand=nike&brand=hm   refresh specific brands now, outside the schedule
 *   ?force=1               start a new full sweep now
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const Route = createFileRoute('/api/cron/refresh-cache')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env.CRON_SECRET?.trim()) {
          return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
        }
        if (!authorized(request)) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const batchSize = Math.max(1, Math.min(4, Number(process.env.REFRESH_BATCH_SIZE) || 2))

        if (url.searchParams.has('status')) {
          return Response.json(await getSweepStatus())
        }

        const brandIds = url.searchParams.getAll('brand')
        if (brandIds.length > 0) {
          const brands = await selectBrandsToRefresh({ batchSize: brandIds.length, brandIds })
          const results = await refreshBrands(brands.slice(0, batchSize), batchSize)
          for (const r of results) console.log(`[cron-refresh] manual ${r.outcome} ${r.brandId} (${r.seconds}s) ${r.detail}`)
          return Response.json({ refreshed: results })
        }

        const report = await runSweep({ maxBrands: batchSize, concurrency: batchSize, force: url.searchParams.has('force') })
        console.log(`[cron-refresh] ${report.status}: ${report.message}`)
        for (const r of report.results) console.log(`[cron-refresh] ${r.outcome} ${r.brandId} (${r.seconds}s) ${r.detail}`)
        const allFailed = report.results.length > 0 && report.results.every((r) => r.outcome === 'failed')
        return Response.json(report, { status: allFailed ? 502 : 200 })
      },
    },
  },
})
