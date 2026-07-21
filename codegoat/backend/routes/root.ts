import type { FastifyPluginAsync } from 'fastify'

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get('/', async function () {
    return { root: true }
  })

  fastify.get('/health', async function () {
    return { status: 'ok' }
  })
}

export default routes
