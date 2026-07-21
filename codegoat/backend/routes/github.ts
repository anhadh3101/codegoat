import type { FastifyInstance } from 'fastify'
import { analyzeRepository } from '../services/deep-dive/rlm'
import { BriefBatchWriter } from '../services/deep-dive/brief-store'
import {
  buildRepositoryTree,
  extractPullRequest,
  extractPullRequests,
  extractRepositories,
  getGithubIntegration,
  getInteger,
  getUserId,
  GITHUB_TOOLS,
  type PaginatedQuery,
  type PullRequestDetailsParams,
  type PullRequestParams
} from '../utils/github'

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
      const integration = await getGithubIntegration(fastify, request)

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
      const integration = await getGithubIntegration(fastify, request)

      if (!integration || integration.status !== 'active') {
        return reply.code(409).send({
          error: 'GitHub is not connected',
          code: 'GITHUB_CONNECTION_REQUIRED'
        })
      }

      const result = await fastify.getComposio().tools.execute(GITHUB_TOOLS.listRepositories, {
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
      const integration = await getGithubIntegration(fastify, request)

      if (!integration || integration.status !== 'active') {
        return reply.code(409).send({
          error: 'GitHub is not connected',
          code: 'GITHUB_CONNECTION_REQUIRED'
        })
      }

      const result = await fastify.getComposio().tools.execute(GITHUB_TOOLS.listPullRequests, {
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

  fastify.get<{
    Params: PullRequestDetailsParams
  }>('/api/repos/:owner/:repo/pulls/:number', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const { owner, repo, number } = request.params

    if (!owner || !repo) {
      return reply.code(400).send({ error: 'Repository owner and name are required' })
    }

    if (!/^[1-9]\d*$/.test(number)) {
      return reply.code(400).send({ error: 'Pull request number must be a positive integer' })
    }

    try {
      const integration = await getGithubIntegration(fastify, request)

      if (!integration || integration.status !== 'active') {
        return reply.code(409).send({
          error: 'GitHub is not connected',
          code: 'GITHUB_CONNECTION_REQUIRED'
        })
      }

      const userId = getUserId(request)
      const result = await fastify.getComposio().tools.execute(GITHUB_TOOLS.getPullRequest, {
        userId,
        connectedAccountId: integration.composio_account_id,
        arguments: { owner, repo, pull_number: Number(number) }
      })
      const pullRequest = extractPullRequest(result) as {
        base?: { repo?: { id?: unknown; owner?: { login?: unknown }; name?: unknown }; sha?: unknown }
        head?: { sha?: unknown }
      }
      const baseOwner = pullRequest.base?.repo?.owner?.login
      const baseRepo = pullRequest.base?.repo?.name
      const baseRepositoryId = pullRequest.base?.repo?.id
      const baseSha = pullRequest.base?.sha
      const headSha = pullRequest.head?.sha

      if (
        typeof baseOwner !== 'string' ||
        typeof baseRepo !== 'string' ||
        typeof baseRepositoryId !== 'number' ||
        !Number.isSafeInteger(baseRepositoryId) ||
        typeof baseSha !== 'string' ||
        typeof headSha !== 'string'
      ) {
        request.log.error({ pullRequest }, 'GitHub pull request response is missing base or head metadata')
        return reply.code(502).send({ error: 'GitHub returned incomplete pull request metadata' })
      }

      const gitTreeResult = await fastify.getComposio().tools.execute(GITHUB_TOOLS.getTree, {
        userId,
        connectedAccountId: integration.composio_account_id,
        arguments: { owner: baseOwner, repo: baseRepo, tree_sha: baseSha, recursive: true }
      })
      const repositoryTree = buildRepositoryTree(gitTreeResult)
      const repositoryUrl = `https://github.com/${baseOwner}/${baseRepo}`
      const existingAnalyses = await fastify.supabaseRequest<{ id: number }[]>({
        path: `repository_analyses?select=id&user_id=eq.${encodeURIComponent(userId)}&repository_url=eq.${encodeURIComponent(repositoryUrl)}&base_sha=eq.${encodeURIComponent(baseSha)}&limit=1`,
        accessToken: request.supabaseAccessToken
      })
      const briefsAlreadyExist = existingAnalyses.length > 0

      console.log('REPO TREE:', JSON.stringify(repositoryTree, null, 2))
      let repositoryBrief = null
      if (!briefsAlreadyExist) {
        const analysisRows = await fastify.supabaseRequest<{ id: number }[]>({
          method: 'POST',
          path: 'repository_analyses',
          accessToken: request.supabaseAccessToken,
          body: {
            user_id: userId,
            provider: 'github',
            provider_repository_id: baseRepositoryId,
            repository_owner: baseOwner,
            repository_name: baseRepo,
            repository_url: repositoryUrl,
            base_sha: baseSha,
            generator_version: 'rlm-v1'
          }
        })
        const analysisId = analysisRows[0]?.id
        if (!analysisId) throw new Error('Supabase did not return the repository analysis id')

        const briefWriter = new BriefBatchWriter({
          fastify,
          accessToken: request.supabaseAccessToken,
          analysisId
        })

        repositoryBrief = await analyzeRepository({
          tree: repositoryTree.tree,
          fastify,
          userId,
          connectedAccountId: integration.composio_account_id,
          owner: baseOwner,
          repo: baseRepo,
          commitSha: baseSha,
          repositoryContext: 'Base branch snapshot',
          onBrief: (brief) => briefWriter.enqueue({ ...brief, user_id: userId })
        })
        await briefWriter.flush()
      }

      console.log(
        briefsAlreadyExist
          ? `[RLM] Skipping base-branch repository analysis; briefs already exist for ${baseOwner}/${baseRepo}@${baseSha}`
          : '[RLM] Base-branch repository analysis complete'
      )

      return {
        pullRequest,
        repositoryTree: {
          owner: baseOwner,
          repo: baseRepo,
          baseSha,
          headSha,
          ...repositoryTree
        },
        repositoryBrief
      }
    } catch (error) {
      request.log.error(error, 'Failed to get GitHub pull request details')
      return reply.code(502).send({ error: 'Unable to get pull request details' })
    }
  })
}
