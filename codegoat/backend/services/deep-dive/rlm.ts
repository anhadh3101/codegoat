import type { FastifyInstance } from 'fastify'
import type { RepositoryTreeNode } from '../../utils/github'
import {
  createSkippedFileBrief,
  generateDirectoryBrief,
  generateFileBrief,
  generateRepositoryBrief
} from './generate-brief'
import type { RepositoryBrief } from './schema'
import { getFileSkipReason } from './file-filter'

const DEFAULT_CONCURRENCY = 5

function printBrief(stage: string, path: string, brief: TreeBrief | RepositoryBrief): void {
  console.log(`[RLM] ${stage} brief for ${path}:`)
  console.log(typeof brief === 'string' ? brief : JSON.stringify(brief, null, 2))
}

export type TreeBrief = string

export type RlmContext = {
  fastify: FastifyInstance
  userId: string
  connectedAccountId: string
  owner: string
  repo: string
  commitSha: string
  repositoryContext?: string
  maxFileSizeBytes?: number
  concurrency?: number
}

export type AnalyzeRepositoryOptions = RlmContext & {
  tree: RepositoryTreeNode[]
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<Result>
): Promise<Result[]> {
  if (items.length === 0) return []

  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length))
  const results = new Array<Result>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

export async function analyzeNode(
  node: RepositoryTreeNode,
  context: RlmContext
): Promise<TreeBrief> {
  const skipReason = getFileSkipReason(
    node,
    context.maxFileSizeBytes ?? 100_000
  )
  if (skipReason) {
    const brief = createSkippedFileBrief(node.path, skipReason)
    printBrief(node.type === 'tree' ? 'directory' : 'file', node.path, brief)
    return brief
  }

  if (node.type === 'blob') {
    const brief = await generateFileBrief({
      fastify: context.fastify,
      userId: context.userId,
      connectedAccountId: context.connectedAccountId,
      owner: context.owner,
      repo: context.repo,
      node,
      repositoryContext: context.repositoryContext,
      maxFileSizeBytes: context.maxFileSizeBytes
    })

    printBrief('file', node.path, brief)
    return brief
  }

  if (node.type !== 'tree') {
    const brief = createSkippedFileBrief(node.path, `Unsupported Git tree node type: ${node.type}`)
    printBrief('node', node.path, brief)
    return brief
  }

  const childBriefs = await mapWithConcurrency(
    node.children ?? [],
    context.concurrency ?? DEFAULT_CONCURRENCY,
    (child) => analyzeNode(child, context)
  )

  const brief = await generateDirectoryBrief({
    fastify: context.fastify,
    node,
    childBriefs,
    repositoryContext: context.repositoryContext
  })

  printBrief('directory', node.path || '/', brief)
  return brief
}

export async function analyzeRepository({
  tree,
  ...context
}: AnalyzeRepositoryOptions): Promise<RepositoryBrief> {
  const topLevelBriefs = await mapWithConcurrency(
    tree,
    context.concurrency ?? DEFAULT_CONCURRENCY,
    (node) => analyzeNode(node, context)
  )

  const brief = await generateRepositoryBrief({
    fastify: context.fastify,
    owner: context.owner,
    repo: context.repo,
    commitSha: context.commitSha,
    childBriefs: topLevelBriefs,
    repositoryContext: context.repositoryContext
  })

  printBrief('repository', `${context.owner}/${context.repo}`, brief)
  return brief
}
