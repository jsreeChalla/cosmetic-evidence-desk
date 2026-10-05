/**
 * Feedback form (Google Forms). Paste your form's link below and push — the
 * "Give feedback" buttons appear automatically; while it's empty they stay hidden.
 *
 * FEEDBACK_FORM_URL: the form's share link, e.g.
 *   https://docs.google.com/forms/d/e/1FAIpQLS.../viewform
 *
 * FEEDBACK_BRAND_FIELD (optional): lets a brand page pre-fill "Which brand(s)
 * did you look at?". In Google Forms: ⋮ menu → "Get pre-filled link", type
 * any text into that question, "Get link", copy it — it contains something
 * like `entry.123456789=...`. Paste just `entry.123456789` here.
 */
export const FEEDBACK_FORM_URL = ''
export const FEEDBACK_BRAND_FIELD = ''

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
