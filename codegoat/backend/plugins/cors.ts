import fp from 'fastify-plugin'

function allowedOrigins(): Set<string> {
  const configured = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
  return new Set(configured.split(',').map((origin) => origin.trim()).filter(Boolean))
}

export default fp(async function (fastify) {
  fastify.addHook('onRequest', async function (request, reply) {
    const origin = request.headers.origin

    if (!origin || !allowedOrigins().has(origin)) return

    reply.header('Access-Control-Allow-Origin', origin)
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    reply.header('Vary', 'Origin')
  })

  // Browser requests with an Authorization header send a preflight OPTIONS
  // request before the actual API request. Define an explicit catch-all route
  // so preflights succeed even when the target endpoint has no OPTIONS route.
  fastify.options('/*', async function (_request, reply) {
    return reply.code(204).send()
  })
})
