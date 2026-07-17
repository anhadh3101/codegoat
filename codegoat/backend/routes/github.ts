import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { UserIntegration } from '../types/fastify'

const DEFAULT_REPOSITORY_TOOL = 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'
const DEFAULT_PULL_REQUEST_TOOL = 'GITHUB_LIST_PULL_REQUESTS'

type PaginatedQuery = {
  page?: string
  per_page?: string
}

type PullRequestParams = {
  owner: string
  repo: string
}

function getUserId(request: FastifyRequest): string {
  if (!request.user?.id) {
    throw new Error('Authenticated user is required')
  }

  return request.user.id
}

function getInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

function extractRepositories(result: unknown): unknown {
  const data = (result as { data?: unknown })?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray((data as { items?: unknown[] })?.items)) return (data as { items: unknown[] }).items
  if (Array.isArray((data as { repositories?: unknown[] })?.repositories)) {
    return (data as { repositories: unknown[] }).repositories
  }
  if (Array.isArray((data as { response_data?: unknown[] })?.response_data)) {
    return (data as { response_data: unknown[] }).response_data
  }
  return data
}

function extractPullRequests(result: unknown): unknown[] {
  const data = (result as { data?: unknown })?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray((data as { items?: unknown[] })?.items)) return (data as { items: unknown[] }).items
  if (Array.isArray((data as { pull_requests?: unknown[] })?.pull_requests)) {
    return (data as { pull_requests: unknown[] }).pull_requests
  }
  if (Array.isArray((data as { response_data?: unknown[] })?.response_data)) {
    return (data as { response_data: unknown[] }).response_data
  }
  return []
}

async function getIntegration(
  fastify: FastifyInstance,
  request: FastifyRequest
): Promise<UserIntegration | null> {
  const userId = encodeURIComponent(getUserId(request))
  const rows = await fastify.supabaseRequest<UserIntegration[]>({
    path: `user_integrations?select=id,composio_account_id,status&user_id=eq.${userId}&provider=eq.github&limit=1`,
    accessToken: request.supabaseAccessToken
  })

  return rows[0] || null
}

export default async function (fastify: FastifyInstance) {
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

  fastify.get<{ Querystring: PaginatedQuery }>('/api/repos', {
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

  fastify.get<{
    Params: PullRequestParams
    Querystring: PaginatedQuery
  }>('/api/repos/:owner/:repo/pulls', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const { owner, repo } = request.params
    const page = getInteger(request.query?.page, 1, 1, 10000)
    const perPage = getInteger(request.query?.per_page, 100, 1, 100)

    if (!owner || !repo) {
      return reply.code(400).send({ error: 'Repository owner and name are required' })
    }

    try {
      const integration = await getIntegration(fastify, request)

      if (!integration || integration.status !== 'active') {
        return reply.code(409).send({
          error: 'GitHub is not connected',
          code: 'GITHUB_CONNECTION_REQUIRED'
        })
      }

      const result = await fastify.getComposio().tools.execute(DEFAULT_PULL_REQUEST_TOOL, {
        userId: getUserId(request),
        connectedAccountId: integration.composio_account_id,
        arguments: { owner, repo, state: 'open', page, per_page: perPage }
      })

      return {
        pullRequests: extractPullRequests(result),
        page,
        perPage
      }
    } catch (error) {
      request.log.error(error, 'Failed to list GitHub pull requests')
      return reply.code(502).send({ error: 'Unable to list open pull requests' })
    }
  })
}
