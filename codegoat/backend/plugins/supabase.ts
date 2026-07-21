import fp from 'fastify-plugin'
import type { SupabaseRequestOptions } from '../types/fastify'

export default fp(async function (fastify) {
  fastify.decorate('supabaseRequest', async function <T = unknown>({
    method = 'GET',
    path,
    accessToken,
    body
  }: SupabaseRequestOptions): Promise<T> {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Supabase server configuration is incomplete') as Error & { statusCode?: number }
      error.statusCode = 503
      throw error
    }

    const headers: Record<string, string> = {
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken || supabaseKey}`,
      Accept: 'application/json'
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers.Prefer = 'resolution=merge-duplicates,return=representation'
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) as T : null

    if (!response.ok) {
      const error = new Error('Supabase database request failed') as Error & {
        statusCode?: number
        details?: unknown
      }
      error.statusCode = response.status
      error.details = data
      throw error
    }

    return data as T
  })
})
