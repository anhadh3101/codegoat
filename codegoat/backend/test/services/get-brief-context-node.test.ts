import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AIMessage } from '@langchain/core/messages'
import { getBriefContextNode } from '../../services/agent/get-brief-context-node'

const scope = {
  chatId: '00000000-0000-0000-0000-000000000000',
  repository: { owner: 'acme', name: 'demo', fullName: 'acme/demo' },
  pullRequest: {
    number: 42,
    base: { owner: 'acme', repository: 'demo', branch: 'main', sha: 'base-sha' },
    incoming: { owner: 'acme', repository: 'demo', branch: 'feature', sha: 'head-sha' }
  }
} as const

function briefRequest() {
  return new AIMessage({
    content: '',
    tool_calls: [{
      id: 'brief-call',
      name: 'get_brief_context',
      args: {
        targets: [{ type: 'file', path: 'src/permissions.ts' }],
        reason: 'Need the authorization contract.'
      }
    }]
  })
}

test('retrieves a model-requested file brief and stores it by target', async () => {
  const result = await getBriefContextNode({
    messages: [briefRequest()],
    scope,
    retrievedBriefs: {}
  }, {
    configurable: {
      getFileBriefRuntime: {
        userId: 'user-1',
        accessToken: 'token',
        supabaseRequest: async <T>({ path }: { path: string }) => {
          if (path.startsWith('repository_analyses')) return [{ id: 9 }] as T
          return [{ brief_markdown: '## Summary\nPermission checks', source_sha: 'base-sha' }] as T
        }
      }
    }
  })

  assert.deepEqual(result.retrievedBriefs, {
    'file:src/permissions.ts': {
      type: 'file',
      path: 'src/permissions.ts',
      status: 'found',
      content: '## Summary\nPermission checks',
      sourceSha: 'base-sha'
    }
  })
  assert.equal(result.messages[0].tool_call_id, 'brief-call')
  assert.deepEqual(JSON.parse(String(result.messages[0].content)), {
    reason: 'Need the authorization contract.',
    briefs: [result.retrievedBriefs?.['file:src/permissions.ts']]
  })
})
