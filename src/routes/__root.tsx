/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

// Public address used in link previews. Override with VITE_SITE_URL if the
// site moves to another domain (redeploy after changing).
const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://cosmetic-evidence-desk.vercel.app').replace(/\/$/, '')
const SHARE_DESCRIPTION =
  'Brand claims checked against independently published evidence: every finding quoted, source-checked and dated. Early prototype.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Evidence Desk — independent safety & sustainability evidence',
      },
      {
        name: 'description',
        content:
          'Look up a brand or retailer from the iGraal France directory and see what independently published research, ratings and legal records say about its safety, sustainability and labour practices. Early prototype.',
      },
      // Link previews (Slack, LinkedIn, WhatsApp, X). Image URLs must be absolute.
      { property: 'og:title', content: 'Evidence Desk' },
      { property: 'og:description', content: SHARE_DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:image', content: `${SITE_URL}/og-image.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Evidence Desk: what brands claim, checked against the evidence' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Evidence Desk' },
      { name: 'twitter:description', content: SHARE_DESCRIPTION },
      { name: 'twitter:image', content: `${SITE_URL}/og-image.png` },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
