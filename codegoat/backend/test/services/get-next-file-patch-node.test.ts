import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AIMessage } from '@langchain/core/messages'
import { getNextFilePatchNode } from '../../services/agent/get-next-file-patch-node'

function patchRequest() {
  return new AIMessage({
    content: '',
    tool_calls: [{ id: 'patch-call', name: 'get_next_file_patch', args: {} }]
  })
}

test('delivers one stored patch and advances the file cursor', async () => {
  const result = await getNextFilePatchNode({
    messages: [patchRequest()],
    nextFileIndex: 0,
    changedFiles: [
      { path: 'src/first.ts', status: 'modified', patch: '@@ -1 +1 @@\n-old\n+new' },
      { path: 'src/second.ts', status: 'added', patch: '@@ -0,0 +1 @@\n+new file' }
    ]
  })

  assert.equal(result.nextFileIndex, 1)
  assert.equal(result.activeFilePath, 'src/first.ts')
  const message = result.messages[0]
  assert.equal(message.tool_call_id, 'patch-call')
  assert.deepEqual(JSON.parse(String(message.content)), {
    file: { path: 'src/first.ts', status: 'modified' },
    patchAvailable: true,
    patch: '@@ -1 +1 @@\n-old\n+new'
  })
})

test('reports an exhausted file queue without advancing the cursor', async () => {
  const result = await getNextFilePatchNode({
    messages: [patchRequest()],
    nextFileIndex: 1,
    changedFiles: [{ path: 'src/first.ts', patch: '+new' }]
  })

  assert.equal(result.activeFilePath, null)
  assert.equal(result.messages[0].content, 'No changed files remain in this pull request.')
  assert.equal('nextFileIndex' in result, false)
})
