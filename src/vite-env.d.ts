/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEEDBACK_FORM_URL?: string
  readonly VITE_FEEDBACK_BRAND_FIELD?: string
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
