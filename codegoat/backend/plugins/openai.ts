import OpenAI from 'openai'
import fp from 'fastify-plugin'

export const OPENROUTER_MODEL = 'openai/gpt-5-mini'

export default fp(async function (fastify) {
  let client: OpenAI | undefined

  fastify.decorate('getOpenAI', function () {
    if (!process.env.OPENROUTER_API_KEY) {
      const error = new Error('OPENROUTER_API_KEY is not configured') as Error & { statusCode?: number }
      error.statusCode = 503
      throw error
    }

    if (!client) {
      client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1'
      })
    }

    return client
  })
})
