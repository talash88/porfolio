/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Supabase project URL (safe to expose — RLS allows read-only). */
  readonly VITE_SUPABASE_URL?: string
  /** Public Supabase anon key (read-only under RLS; writes stay server-side). */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
