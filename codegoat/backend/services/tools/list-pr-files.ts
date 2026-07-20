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

export async function listPullRequestFiles(
  scope: ChatScope,
  runtime: ListPullRequestFilesRuntime
): Promise<unknown[]> {
  const { owner, repository: repo } = scope.pullRequest.base
  const pull_number = scope.pullRequest.number
  const responses: unknown[] = []
  const per_page = 100

  for (let page = 1; page <= 30; page += 1) {
    const result = await runtime.composio.tools.execute(GITHUB_TOOLS.listPullRequestFiles, {
      userId: runtime.userId,
      connectedAccountId: runtime.connectedAccountId,
      arguments: { owner, repo, pull_number, page, per_page }
    })
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

  return responses
}
