import type { FastifyPluginAsync } from 'fastify'

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get('/', async function () {
    return 'this is an example'
  })
}

export default routes
