import { ToolMessage, type AIMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import { getBriefContexts, type BriefContextResult, type BriefTarget, type GetFileBriefRuntime } from '../briefs/get-file-brief'
import { BriefContextRequestSchema } from './tools'
import type { ChatScope } from './scope'

type RetrievedBrief = {
  type: 'file' | 'directory' | 'repository'
  path: string
  status: 'found' | 'not_found' | 'error'
  content?: string
  sourceSha?: string | null
}

type GetBriefContextNodeState = {
  messages: unknown[]
  scope: ChatScope
  retrievedBriefs: Record<string, RetrievedBrief>
}

type GetBriefContextNodeConfig = RunnableConfig & {
  configurable?: RunnableConfig['configurable'] & {
    getFileBriefRuntime?: GetFileBriefRuntime
  }
}

function targetPath(target: BriefTarget): string {
  return target.type === 'repository' ? '' : target.path ?? ''
}

function cacheKey(target: BriefTarget): string {
  return `${target.type}:${targetPath(target)}`
}

function serializeBrief(brief: RetrievedBrief): RetrievedBrief {
  return brief
}

function asBrief(target: BriefTarget, result: BriefContextResult): RetrievedBrief {
  const path = targetPath(target)
  if (!result) return { type: target.type, path, status: 'not_found' }

  return {
    type: target.type,
    path,
    status: 'found',
    content: result.content,
    sourceSha: result.sourceSha
  }
}

function getToolCall(messages: unknown[]) {
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined
  const toolCall = lastMessage?.tool_calls?.find((call) => call.name === 'get_brief_context')
  if (!toolCall?.id) throw new Error('The brief context node requires a get_brief_context tool call')

  const parsed = BriefContextRequestSchema.safeParse(toolCall.args)
  if (!parsed.success) throw new Error('The brief context tool call has invalid arguments')

  return { id: toolCall.id, request: parsed.data }
}

export async function getBriefContextNode(
  state: GetBriefContextNodeState,
  config: GetBriefContextNodeConfig
) {
  const { id, request } = getToolCall(state.messages)
  console.log(
    `[get-brief-context-node.ts (getBriefContextNode)] Fetching ${request.targets.length} brief target(s); reason=${request.reason}`
  )

  const cachedBriefs: RetrievedBrief[] = []
  const missingTargets: BriefTarget[] = []
  for (const target of request.targets) {
    const cached = state.retrievedBriefs[cacheKey(target)]
    if (cached && cached.status !== 'error') cachedBriefs.push(cached)
    else missingTargets.push(target)
  }

  let fetchedBriefs: RetrievedBrief[] = []
  const updates: Record<string, RetrievedBrief> = {}
  if (missingTargets.length > 0) {
    const runtime = config.configurable?.getFileBriefRuntime
    if (!runtime) {
      fetchedBriefs = missingTargets.map((target) => ({
        type: target.type,
        path: targetPath(target),
        status: 'error' as const
      }))
    } else {
      try {
        const results = await getBriefContexts(state.scope, missingTargets, runtime)
        fetchedBriefs = missingTargets.map((target, index) => asBrief(target, results[index]))
      } catch (error) {
        console.error('[get-brief-context-node.ts (getBriefContextNode)] Brief context lookup failed', error)
        fetchedBriefs = missingTargets.map((target) => ({
          type: target.type,
          path: targetPath(target),
          status: 'error' as const
        }))
      }
    }

    for (const brief of fetchedBriefs) {
      updates[`${brief.type}:${brief.path}`] = brief
      console.log(
        `[get-brief-context-node.ts (getBriefContextNode)] Brief ${brief.status} name=${brief.path || '/'} type=${brief.type}`
      )
    }
  }

  const briefs = [...cachedBriefs, ...fetchedBriefs].map(serializeBrief)
  return {
    ...(Object.keys(updates).length > 0 ? { retrievedBriefs: updates } : {}),
    messages: [new ToolMessage({
      tool_call_id: id,
      content: JSON.stringify({
        reason: request.reason,
        briefs
      })
    })]
  }
}
