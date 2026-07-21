import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchFileBriefNode } from '../../services/agent/fetch-file-brief-node'

const scope = {
  chatId: '00000000-0000-0000-0000-000000000000',
  repository: { owner: 'acme', name: 'demo', fullName: 'acme/demo' },
  pullRequest: {
    number: 42,
    base: { owner: 'acme', repository: 'demo', branch: 'main', sha: 'base-sha' },
    incoming: { owner: 'acme', repository: 'demo', branch: 'feature', sha: 'head-sha' }
  }
} as const

test('fetches and stores the active file brief', async () => {
  const requestedPaths: string[] = []
  const result = await fetchFileBriefNode({
    messages: [],
    scope,
    activeFilePath: 'src/auth.ts',
    changedFiles: [{ path: 'src/auth.ts' }],
    fileBriefs: {}
  }, {
    configurable: {
      getFileBriefRuntime: {
        userId: 'user-1',
        accessToken: 'token',
        supabaseRequest: async <T>({ path }: { path: string }) => {
          requestedPaths.push(path)
          if (path.startsWith('repository_analyses')) return [{ id: 9 }] as T
          return [{ brief_markdown: '## Summary\nAuth responsibilities', source_sha: 'base-sha' }] as T
        }
      }
    }
  })

  assert.equal(requestedPaths.length, 2)
  assert.deepEqual(result.fileBriefs, {
    'src/auth.ts': {
      status: 'found',
      content: '## Summary\nAuth responsibilities',
      sourcePath: 'src/auth.ts',
      sourceSha: 'base-sha'
    }
  })
  assert.match(String(result.messages[0].content), /Auth responsibilities/)
})
