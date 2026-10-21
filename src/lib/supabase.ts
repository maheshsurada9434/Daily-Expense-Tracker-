import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

// Only the public (anon / publishable) key ever reaches the browser. Row Level Security does the real protection.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

/** Friendly text for the errors people are likely to hit. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  const msg = err?.message ?? 'Something went wrong'
  if (err?.code === '23505') return 'That already exists.'
  if (err?.code === '23503') return 'This is still used by other records. Archive it instead, or remove the records that use it.'
  if (err?.code === '23514') return 'One of the values is out of the allowed range.'
  if (err?.code === '42501') return 'You do not have permission to do that.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Cannot reach the server. Check your connection and try again.'
  return msg
}
