import type { SupabaseRequestOptions } from '../../types/fastify'
import type { ChatScope } from '../agent/scope'

type SupabaseRequest = <T = unknown>(options: SupabaseRequestOptions) => Promise<T>

export type GetFileBriefRuntime = {
  userId: string
  accessToken: string | null
  supabaseRequest: SupabaseRequest
}

type AnalysisRow = { id: number }

type BriefRow = {
  brief_markdown?: string | null
  brief_json?: Record<string, unknown> | null
  source_sha?: string | null
}

export type FileBriefResult = {
  content: string
  sourcePath: string
  sourceSha?: string | null
} | null

export type BriefTarget = {
  type: 'file' | 'directory' | 'repository'
  path?: string
}

export type BriefContextResult = {
  target: Required<Pick<BriefTarget, 'type'>> & { path: string }
  content: string
  sourceSha?: string | null
} | null

function repositoryUrl(scope: ChatScope): string {
  const { owner, repository } = scope.pullRequest.base
  return `https://github.com/${owner}/${repository}`
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

async function getAnalysisId(scope: ChatScope, runtime: GetFileBriefRuntime): Promise<number | null> {
  const analyses = await runtime.supabaseRequest<AnalysisRow[]>({
    path: `repository_analyses?select=id&user_id=eq.${encode(runtime.userId)}&repository_url=eq.${encode(repositoryUrl(scope))}&base_sha=eq.${encode(scope.pullRequest.base.sha)}&limit=1`,
    accessToken: runtime.accessToken
  })

  return analyses[0]?.id ?? null
}

function normalizedPath(target: BriefTarget): string {
  return target.type === 'repository' ? '' : target.path ?? ''
}

async function getBriefByTarget(
  analysisId: number,
  target: BriefTarget,
  runtime: GetFileBriefRuntime
): Promise<BriefContextResult> {
  const path = normalizedPath(target)
  if (target.type !== 'repository' && !path) return null

  const rows = await runtime.supabaseRequest<BriefRow[]>({
    path: `repository_briefs?select=brief_markdown,brief_json,source_sha&analysis_id=eq.${analysisId}&brief_type=eq.${target.type}&path=eq.${encode(path)}&limit=1`,
    accessToken: runtime.accessToken
  })
  const row = rows[0]
  if (!row) return null

  const content = typeof row.brief_markdown === 'string' && row.brief_markdown.trim()
    ? row.brief_markdown
    : row.brief_json
      ? JSON.stringify(row.brief_json)
      : ''
  if (!content) return null

  return {
    target: { type: target.type, path },
    content,
    sourceSha: row.source_sha
  }
}

/** Retrieve small, exact brief targets scoped to the current repository snapshot. */
export async function getBriefContexts(
  scope: ChatScope,
  targets: BriefTarget[],
  runtime: GetFileBriefRuntime
): Promise<BriefContextResult[]> {
  const analysisId = await getAnalysisId(scope, runtime)
  if (!analysisId) return targets.map(() => null)

  return Promise.all(targets.map((target) => getBriefByTarget(analysisId, target, runtime)))
}

export async function getFileBrief(
  scope: ChatScope,
  path: string,
  previousPath: string | undefined,
  runtime: GetFileBriefRuntime
): Promise<FileBriefResult> {
  const analysisId = await getAnalysisId(scope, runtime)
  if (!analysisId) return null

  const candidatePaths = [path, previousPath].filter(
    (candidate, index, candidates): candidate is string => Boolean(candidate) && candidates.indexOf(candidate) === index
  )

  for (const candidatePath of candidatePaths) {
    const result = await getBriefByTarget(analysisId, { type: 'file', path: candidatePath }, runtime)
    if (result) {
      return {
        content: result.content,
        sourcePath: candidatePath,
        sourceSha: result.sourceSha
      }
    }
  }

  return null
}
