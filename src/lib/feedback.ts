/**
 * Feedback form (Google Forms), configured with environment variables — set
 * them in Vercel (Settings → Environment Variables) or in .env locally:
 *
 *   VITE_FEEDBACK_FORM_URL     the form's share link, e.g.
 *                              https://docs.google.com/forms/d/e/1FAIpQLS.../viewform
 *   VITE_FEEDBACK_BRAND_FIELD  optional: lets brand pages pre-fill "Which brand(s)
 *                              did you look at?". In Google Forms: ⋮ → "Get
 *                              pre-filled link", type anything into that question,
 *                              "Get link"; the link contains `entry.123456789=…` —
 *                              use just `entry.123456789`.
 *
 * The VITE_ prefix makes them available in the browser (the link is public
 * anyway). They're read at build time, so redeploy after changing them. While
 * VITE_FEEDBACK_FORM_URL is empty the "Give feedback" buttons stay hidden.
 */
export const FEEDBACK_FORM_URL: string = import.meta.env.VITE_FEEDBACK_FORM_URL ?? ''
export const FEEDBACK_BRAND_FIELD: string = import.meta.env.VITE_FEEDBACK_BRAND_FIELD ?? ''

export function feedbackUrl(brandName?: string): string | undefined {
  const base = FEEDBACK_FORM_URL.trim()
  if (!base) return undefined
  const field = FEEDBACK_BRAND_FIELD.trim()
  if (!brandName || !field) return base
  try {
    const url = new URL(base)
    url.searchParams.set('usp', 'pp_url')
    url.searchParams.set(field, brandName)
    return url.toString()
  } catch {
    return base
  }
}
