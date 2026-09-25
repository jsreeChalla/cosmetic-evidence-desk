/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

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
          'Look up any brand or retailer from the iGraal France directory and see what independently published research, ratings and legal records actually say about its safety, sustainability, and labour practices.',
      },
      { property: 'og:title', content: 'Evidence Desk' },
      {
        property: 'og:description',
        content:
          'Independent, source-verified safety and sustainability evidence for cosmetics, fashion, electronics, and food brands — no hallucinations, every claim quoted and checked.',
      },
      { property: 'og:type', content: 'website' },
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
