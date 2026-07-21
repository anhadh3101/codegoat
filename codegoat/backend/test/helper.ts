import { build as buildApplication } from 'fastify-cli/helper'
import path from 'node:path'
import type { TestContext } from 'node:test'
import type { FastifyInstance } from 'fastify'

const AppPath = path.join(__dirname, '..', 'app.ts')

function config() {
  return {
    skipOverride: true
  }
}

async function build(t: TestContext): Promise<FastifyInstance> {
  const argv = [AppPath]
  const app = await buildApplication(argv, config())

  t.after(() => app.close())

  return app
}

export {
  config,
  build
}
