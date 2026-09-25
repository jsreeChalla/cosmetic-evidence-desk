import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Cron schedule for the cache refresh (UTC). The catalogue is refreshed in one
// full sweep every 90 days; on all other days this call just checks the saved
// sweep state and exits (no research, no credits). During a sweep each call
// refreshes REFRESH_BATCH_SIZE brands. Vercel Hobby allows one run per day
// (a sweep then takes ~33 days); on Pro use e.g. '0 * * * *' to finish a sweep
// in about a day and a half.
const REFRESH_CRON_SCHEDULE = '0 3 * * *'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    // Deployment adapter. On Vercel the `vercel` preset is picked automatically.
    nitro({
      vercel: {
        functions: {
          // Frankfurt — create the MongoDB Atlas cluster in AWS eu-central-1 to match.
          regions: ['fra1'],
          // A cold research pass can take up to ~120s (OVERALL_BUDGET_MS).
          maxDuration: 300,
        },
        config: {
          crons: [{ path: '/api/cron/refresh-cache', schedule: REFRESH_CRON_SCHEDULE }],
        },
      },
    }),
    viteReact(),
  ],
})
