import fp from 'fastify-plugin'
import { Composio } from '@composio/core'

const GITHUB_TOOLKIT_VERSION = '20260713_00'

export default fp(async function (fastify) {
  let client: Composio | undefined

  fastify.decorate('getComposio', function () {
    if (!process.env.COMPOSIO_API_KEY) {
      const error = new Error('COMPOSIO_API_KEY is not configured') as Error & { statusCode?: number }
      error.statusCode = 503
      throw error
    }

    if (!client) {
      client = new Composio({
        apiKey: process.env.COMPOSIO_API_KEY,
        toolkitVersions: { github: GITHUB_TOOLKIT_VERSION }
      })
    }

    return client
  })
})
