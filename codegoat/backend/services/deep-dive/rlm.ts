import type { FastifyInstance } from 'fastify'
import type { RepositoryTreeNode } from '../../utils/github'
import {
  generateDirectoryBrief,
  generateFileBrief,
  generateRepositoryBrief
} from './generate-brief'
import type { RepositoryBrief } from './schema'

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
    return `## Summary\nSkipped ${node.path}.\n\n## Responsibilities\n- None; unsupported Git tree node type.\n\n## Key Symbols\n- None.\n\n## Dependencies\n- None available.\n\n## Observations\n- Node type: ${node.type}\n\n## Findings\n- [info] Unsupported node — This node was not analyzed. Evidence: ${node.path}`
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
