import type { Composio } from '@composio/core'
import { GITHUB_TOOLS, extractPullRequestFiles } from '../../utils/github'
import type { ChatScope } from '../agent/scope'

function removePatches(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result

  const response = result as { data?: unknown }
  const data = response.data
  if (!data || typeof data !== 'object') return result

  const details = (data as { details?: unknown }).details
  if (!Array.isArray(details)) return result

  return {
    ...response,
    data: {
      ...(data as Record<string, unknown>),
      details: details.map((detail) => {
        if (!detail || typeof detail !== 'object') return detail
        const { patch: _patch, ...metadata } = detail as Record<string, unknown>
        return metadata
      })
    }
  }
}

export type ListPullRequestFilesRuntime = {
  composio: Composio
  userId: string
  connectedAccountId: string
}

export type ChangedFile = {
  path: string
  status?: string
  previousPath?: string
  patch?: string
}

export type PullRequestFilesResult = {
  /** Patch-free responses that are safe to include in the model's file-list message. */
  responses: unknown[]
  /** Structured file records, including a patch when GitHub supplied one. */
  changedFiles: ChangedFile[]
}

/**
 * Convert the paginated GitHub responses into the small, stable file records
 * that downstream graph nodes can use without parsing tool messages.
 */
export function extractChangedFiles(responses: unknown[]): ChangedFile[] {
  const files = responses.flatMap((response) => extractPullRequestFiles(response))
  const byPath = new Map<string, ChangedFile>()

  for (const file of files) {
    if (!file || typeof file !== 'object') continue

    const record = file as Record<string, unknown>
    const path = typeof record.filename === 'string'
      ? record.filename
      : typeof record.path === 'string'
        ? record.path
        : undefined

    if (!path || byPath.has(path)) continue

    byPath.set(path, {
      path,
      ...(typeof record.status === 'string' ? { status: record.status } : {}),
      ...(typeof record.previous_filename === 'string'
        ? { previousPath: record.previous_filename }
        : typeof record.previousPath === 'string'
          ? { previousPath: record.previousPath }
          : {}),
      ...(typeof record.patch === 'string' ? { patch: record.patch } : {})
    })
  }

  return [...byPath.values()]
}

export async function listPullRequestFiles(
  scope: ChatScope,
  runtime: ListPullRequestFilesRuntime
): Promise<PullRequestFilesResult> {
  const { owner, repository: repo } = scope.pullRequest.base
  const pull_number = scope.pullRequest.number
  const responses: unknown[] = []
  const responsesWithPatches: unknown[] = []
  const per_page = 100

  for (let page = 1; page <= 30; page += 1) {
    const result = await runtime.composio.tools.execute(GITHUB_TOOLS.listPullRequestFiles, {
      userId: runtime.userId,
      connectedAccountId: runtime.connectedAccountId,
      arguments: { owner, repo, pull_number, page, per_page }
    })
    responsesWithPatches.push(result)
    const responseWithoutPatches = removePatches(result)
    console.log(
      `[list-pr-files.ts (listPullRequestFiles)] Doing print PR file metadata page ${page}: ${JSON.stringify(responseWithoutPatches)}`
    )
    responses.push(responseWithoutPatches)

    const pageFiles = extractPullRequestFiles(responseWithoutPatches)
    console.log(
      `[list-pr-files.ts (listPullRequestFiles)] Doing page ${page} contains ${pageFiles.length} files`
    )

    if (pageFiles.length < per_page) break
  }

  return {
    responses,
    changedFiles: extractChangedFiles(responsesWithPatches)
  }
}
