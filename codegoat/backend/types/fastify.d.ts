import type { Composio } from '@composio/core'
import type OpenAI from 'openai'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface SupabaseUser {
  id: string
  email?: string
  [key: string]: unknown
}

export interface UserIntegration {
  id: string
  composio_account_id: string
  status: string
}

export interface SupabaseRequestOptions {
  method?: string
  path: string
  accessToken?: string | null
  body?: Record<string, unknown> | Array<Record<string, unknown>>
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    getComposio: () => Composio
    getOpenAI: () => OpenAI
    someSupport: () => string
    supabaseRequest: <T = unknown>(options: SupabaseRequestOptions) => Promise<T>
  }

  interface FastifyRequest {
    user: SupabaseUser | null
    supabaseAccessToken: string | null
  }
}
