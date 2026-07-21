import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { SupabaseUser } from '../types/fastify'

export default fp(async function (fastify) {
  fastify.decorateRequest('user', null)
  fastify.decorateRequest('supabaseAccessToken', null)

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)

    if (!match) {
      return reply.code(401).send({ error: 'Missing Supabase access token' })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return reply.code(503).send({ error: 'Supabase server configuration is incomplete' })
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${match[1]}`
      }
    })

    if (!response.ok) {
      return reply.code(401).send({ error: 'Invalid or expired Supabase access token' })
    }

    request.supabaseAccessToken = match[1]
    request.user = await response.json() as SupabaseUser
  })
})
