/* Developer Community client wiring.
 *
 * Production architecture: Supabase Realtime delivers new messages to every
 * connected browser (postgres_changes on community_messages) and presence
 * powers the online-members list — no WebSocket server required, so it works
 * everywhere the portfolio deploys (Vercel included).
 *
 * Writes never happen from the browser: messages/reports POST to
 * /api/community/* (same-origin Vercel functions) which hold the secret
 * service-role key. The anon key used here is read-only via RLS.
 *
 * The Supabase SDK is loaded lazily (same pattern as the Three.js scene) so
 * it is never part of the first paint's JavaScript. */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Exactly one group, per requirement — no channels or extra rooms. */
export const COMMUNITY_GROUP = 'developer-community'
/** Realtime channel: carries BOTH postgres_changes inserts and presence. */
export const COMMUNITY_REALTIME_CHANNEL = 'developer-community-live'

export const HIDDEN_REPORT_THRESHOLD_NOTE = 'Reported messages are hidden from the group once several members report them.'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isCommunityConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let clientPromise: Promise<SupabaseClient> | null = null

export function loadCommunityClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    if (!isCommunityConfigured()) {
      return Promise.reject(new Error('Community environment variables are not set.'))
    }
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string),
    )
  }
  return clientPromise
}

/* ---------------------------------------------------------------- identity
 * Anonymous visitors keep a stable random user id in localStorage, so the
 * "self" highlight and presence survive refreshes with zero authentication.
 */

const USER_ID_KEY = 'community:user:id'
const USER_NAME_KEY = 'community:user:name'
const USER_PROFILE_KEY = 'community:user:profile'

function generateRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function getStoredUserId(): string {
  try {
    let id = window.localStorage.getItem(USER_ID_KEY)
    if (!id) {
      id = generateRandomId()
      window.localStorage.setItem(USER_ID_KEY, id)
    }
    return id
  } catch {
    return generateRandomId()
  }
}

export function getStoredIdentity(): { displayName: string; profile: string } | null {
  try {
    const displayName = window.localStorage.getItem(USER_NAME_KEY) ?? ''
    if (displayName.trim().length < 2) return null
    return { displayName, profile: window.localStorage.getItem(USER_PROFILE_KEY) || 'Student developer' }
  } catch {
    return null
  }
}

export function storeIdentity(displayName: string, profile: string): void {
  try {
    window.localStorage.setItem(USER_NAME_KEY, displayName)
    window.localStorage.setItem(USER_PROFILE_KEY, profile)
  } catch {
    /* private mode: identity just won't survive the refresh */
  }
}
