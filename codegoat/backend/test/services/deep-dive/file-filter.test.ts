import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFileSkipReason } from '../../../services/deep-dive/file-filter'
import type { RepositoryTreeNode } from '../../../utils/github'

function node(path: string, type: string = 'blob', size?: number): RepositoryTreeNode {
  return { path, name: path.split('/').at(-1) ?? path, type, size, sha: 'sha' }
}

test('file filter skips generated and dependency directories', () => {
  assert.match(getFileSkipReason(node('src/dist', 'tree'), 100_000) ?? '', /Generated directory/)
  assert.match(getFileSkipReason(node('node_modules', 'tree'), 100_000) ?? '', /Dependency directory/)
})

test('file filter skips lockfiles and source maps', () => {
  assert.match(getFileSkipReason(node('package-lock.json'), 100_000) ?? '', /Lockfile/)
  assert.match(getFileSkipReason(node('dist/app.js.map'), 100_000) ?? '', /Source map/)
})

test('file filter skips binary files and oversized files', () => {
  assert.match(getFileSkipReason(node('assets/logo.png'), 100_000) ?? '', /Binary file type/)
  assert.match(getFileSkipReason(node('src/large.ts', 'blob', 100_001), 100_000) ?? '', /exceeds/)
})

test('file filter keeps source, documentation, manifests, workflows, and migrations', () => {
  for (const path of [
    'src/index.ts',
    'README.md',
    'package.json',
    '.github/workflows/ci.yml',
    'db/migrations/001_init.sql'
  ]) {
    assert.equal(getFileSkipReason(node(path), 100_000), null, path)
  }
})
