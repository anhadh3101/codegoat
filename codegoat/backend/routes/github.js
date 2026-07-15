'use strict'

const DEFAULT_REPOSITORY_TOOL = 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'

function getUserId(request) {
  return request.user.id
}

function getInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

function extractRepositories(result) {
  const data = result?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.repositories)) return data.repositories
  if (Array.isArray(data?.response_data)) return data.response_data
  return data
}

async function getIntegration(fastify, request) {
  const userId = encodeURIComponent(request.user.id)
  const rows = await fastify.supabaseRequest({
    path: `user_integrations?select=id,composio_account_id,status&user_id=eq.${userId}&provider=eq.github&limit=1`,
    accessToken: request.supabaseAccessToken
  })

  return rows[0] || null
}

module.exports = async function (fastify) {
  fastify.post('/api/integrations/github/connect', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    if (!process.env.COMPOSIO_GITHUB_CALLBACK_URL) {
      return reply.code(503).send({ error: 'GitHub Composio configuration is incomplete' })
    }

    try {
      const composio = fastify.getComposio()
      const authConfigs = await composio.authConfigs.list({ toolkit: 'github' })
      const authConfigId = authConfigs.items[0]?.id

      if (!authConfigId) {
        return reply.code(503).send({ error: 'No GitHub auth configuration is available in Composio' })
      }

      const connectionRequest = await composio.connectedAccounts.link(
        getUserId(request),
        authConfigId,
        { callbackUrl: process.env.COMPOSIO_GITHUB_CALLBACK_URL }
      )

      await fastify.supabaseRequest({
        method: 'POST',
        path: 'user_integrations?on_conflict=user_id,provider',
        accessToken: request.supabaseAccessToken,
        body: {
          user_id: getUserId(request),
          provider: 'github',
          composio_account_id: connectionRequest.id,
          status: 'active'
        }
      })

      return {
        connectionId: connectionRequest.id,
        redirectUrl: connectionRequest.redirectUrl
      }
    } catch (error) {
      request.log.error(error, 'Failed to create GitHub connection')
      return reply.code(502).send({ error: 'Unable to start GitHub connection' })
    }
  })

  fastify.get('/api/integrations/github/callback', async function () {
    return {
      message: 'GitHub authorization returned. Check /api/integrations/github/status before listing repositories.'
    }
  })

  fastify.get('/api/integrations/github/status', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    try {
      const integration = await getIntegration(fastify, request)

      return {
        connected: Boolean(integration),
        connectionId: integration?.composio_account_id ?? null,
        status: integration?.status ?? null
      }
    } catch (error) {
      request.log.error(error, 'Failed to check GitHub connection')
      return reply.code(502).send({ error: 'Unable to check GitHub connection' })
    }
  })

  fastify.get('/api/repos', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const page = getInteger(request.query?.page, 1, 1, 10000)
    const perPage = getInteger(request.query?.per_page, 100, 1, 100)

    try {
      const integration = await getIntegration(fastify, request)

      if (!integration || integration.status !== 'active') {
        return reply.code(409).send({
          error: 'GitHub is not connected',
          code: 'GITHUB_CONNECTION_REQUIRED'
        })
      }

      const result = await fastify.getComposio().tools.execute(DEFAULT_REPOSITORY_TOOL, {
        userId: getUserId(request),
        connectedAccountId: integration.composio_account_id,
        arguments: { page, per_page: perPage }
      })

      return {
        repositories: extractRepositories(result),
        page,
        perPage
      }
    } catch (error) {
      request.log.error(error, 'Failed to list GitHub repositories')
      return reply.code(502).send({ error: 'Unable to list GitHub repositories' })
    }
  })
}
