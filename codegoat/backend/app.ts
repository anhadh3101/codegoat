import path from 'node:path'
import AutoLoad from '@fastify/autoload'
import type { FastifyPluginAsync } from 'fastify'

const options = {}

const app: FastifyPluginAsync = async function (fastify, opts) {
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts)
  })

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts)
  })
}

export default app
export { options }
