import type { FastifyPluginAsync } from 'fastify'

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get('/', async function () {
    return { root: true }
  })
}

export default routes
