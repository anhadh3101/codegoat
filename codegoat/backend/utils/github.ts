import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { UserIntegration } from '../types/fastify'

export const GITHUB_TOOLS = {
  listRepositories: 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
  listPullRequests: 'GITHUB_LIST_PULL_REQUESTS',
  listPullRequestFiles: 'GITHUB_LIST_PULL_REQUESTS_FILES',
  getPullRequest: 'GITHUB_GET_A_PULL_REQUEST',
  getTree: 'GITHUB_GET_A_TREE',
  getBlob: 'GITHUB_GET_A_BLOB'
} as const

export type PaginatedQuery = {
  page?: string
  per_page?: string
}

export type PullRequestParams = {
  owner: string
  repo: string
}

export type PullRequestDetailsParams = PullRequestParams & {
  number: string
}

type GitTreeEntry = {
  path?: unknown
  type?: unknown
  sha?: unknown
  size?: unknown
}

export type RepositoryTreeNode = {
  name: string
  path: string
  type: string
  sha?: string
  size?: number
  children?: RepositoryTreeNode[]
}

export function getUserId(request: FastifyRequest): string {
  if (!request.user?.id) {
    throw new Error('Authenticated user is required')
  }

  return request.user.id
}

export function getInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

export function extractRepositories(result: unknown): unknown {
  const data = (result as { data?: unknown })?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray((data as { items?: unknown[] })?.items)) return (data as { items: unknown[] }).items
  if (Array.isArray((data as { repositories?: unknown[] })?.repositories)) {
    return (data as { repositories: unknown[] }).repositories
  }
  if (Array.isArray((data as { response_data?: unknown[] })?.response_data)) {
    return (data as { response_data: unknown[] }).response_data
  }
  return data
}

export function extractPullRequests(result: unknown): unknown[] {
  const data = (result as { data?: unknown })?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray((data as { items?: unknown[] })?.items)) return (data as { items: unknown[] }).items
  if (Array.isArray((data as { pull_requests?: unknown[] })?.pull_requests)) {
    return (data as { pull_requests: unknown[] }).pull_requests
  }
  if (Array.isArray((data as { response_data?: unknown[] })?.response_data)) {
    return (data as { response_data: unknown[] }).response_data
  }
  return []
}

export function extractPullRequest(result: unknown): unknown {
  const data = (result as { data?: unknown })?.data ?? result
  return (data as { response_data?: unknown })?.response_data ?? data
}

export function extractPullRequestFiles(result: unknown): unknown[] {
  let data: unknown = (result as { data?: unknown })?.data ?? result

  for (let depth = 0; depth < 4; depth += 1) {
    if (Array.isArray(data)) return data
    if (!data || typeof data !== 'object') return []

    const object = data as {
      files?: unknown
      details?: unknown
      items?: unknown
      response_data?: unknown
      data?: unknown
    }

    if (Array.isArray(object.files)) return object.files
    if (Array.isArray(object.details)) return object.details
    if (Array.isArray(object.items)) return object.items

    if (object.response_data !== undefined) {
      data = object.response_data
      continue
    }

    if (object.data !== undefined && object.data !== data) {
      data = object.data
      continue
    }

    return []
  }

  return []
}

export function buildRepositoryTree(result: unknown): {
  tree: RepositoryTreeNode[]
  truncated: boolean
} {
  const data = extractPullRequest(result) as { tree?: unknown; truncated?: unknown }
  const entries = Array.isArray(data) ? data : data.tree
  const root: RepositoryTreeNode = { name: '', path: '', type: 'tree', children: [] }

  if (!Array.isArray(entries)) {
    return { tree: [], truncated: Boolean(data.truncated) }
  }

  for (const entry of entries as GitTreeEntry[]) {
    if (typeof entry.path !== 'string' || !entry.path) continue

    const parts = entry.path.split('/')
    let parent = root

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]
      const path = parts.slice(0, index + 1).join('/')
      const isLeaf = index === parts.length - 1
      const children = parent.children ?? (parent.children = [])
      let node = children.find((child) => child.name === name)

      if (!node) {
        node = {
          name,
          path,
          type: isLeaf && typeof entry.type === 'string' ? entry.type : 'tree',
          ...(isLeaf && typeof entry.sha === 'string' ? { sha: entry.sha } : {}),
          ...(isLeaf && typeof entry.size === 'number' ? { size: entry.size } : {}),
          ...(!isLeaf ? { children: [] } : {})
        }
        children.push(node)
      }

      if (isLeaf) {
        node.type = typeof entry.type === 'string' ? entry.type : node.type
        if (typeof entry.sha === 'string') node.sha = entry.sha
        if (typeof entry.size === 'number') node.size = entry.size
      }

      parent = node
    }
  }

  const sortNodes = (nodes: RepositoryTreeNode[]): RepositoryTreeNode[] => nodes
    .sort((left, right) => {
      const leftIsDirectory = left.type === 'tree'
      const rightIsDirectory = right.type === 'tree'
      if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    .map((node) => ({
      ...node,
      ...(node.children ? { children: sortNodes(node.children) } : {})
    }))

  return { tree: sortNodes(root.children ?? []), truncated: Boolean(data.truncated) }
}

export async function getGithubIntegration(
  fastify: FastifyInstance,
  request: FastifyRequest
): Promise<UserIntegration | null> {
  const userId = encodeURIComponent(getUserId(request))
  const rows = await fastify.supabaseRequest<UserIntegration[]>({
    path: `user_integrations?select=id,composio_account_id,status&user_id=eq.${userId}&provider=eq.github&limit=1`,
    accessToken: request.supabaseAccessToken
  })

  return rows[0] || null
}
