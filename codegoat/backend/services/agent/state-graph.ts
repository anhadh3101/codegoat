import { SystemMessage } from '@langchain/core/messages'
import { END, MessagesValue, ReducedValue, START, StateGraph, StateSchema } from '@langchain/langgraph'
import { codegoatModel } from './codegoat'
import { getNextFilePatchNode } from './get-next-file-patch-node'
import { fetchFileBriefNode } from './fetch-file-brief-node'
import { getBriefContextNode } from './get-brief-context-node'
import { listPrFilesNode } from './list-pr-files-node'
import { ChatScopeSchema } from './scope'
import { getBriefContextTool, getNextFilePatchTool, getPrContextTool } from './tools'
import type { ListPullRequestFilesRuntime } from '../tools/list-pr-files'
import type { GetFileBriefRuntime } from '../briefs/get-file-brief'
import { z } from 'zod'
import { codegoatPrompt } from '../prompt/codegoat'

const ChangedFileSchema = z.object({
  path: z.string().min(1),
  status: z.string().optional(),
  previousPath: z.string().optional(),
  patch: z.string().optional()
})

/**
 * The outer graph's public contract. Scope is kept in graph state so future
 * tool nodes can use the validated repository and pull-request boundary
 * without taking those values from the model.
 */
const AgentState = new StateSchema({
  messages: MessagesValue,
  scope: ChatScopeSchema,
  changedFiles: z.array(ChangedFileSchema).default([]),
  nextFileIndex: z.number().int().nonnegative().default(0),
  activeFilePath: z.string().min(1).nullable().default(null),
  fileBriefs: new ReducedValue(
    z.record(z.string(), z.object({
      status: z.enum(['found', 'not_found', 'error']),
      content: z.string().optional(),
      sourcePath: z.string().optional(),
      sourceSha: z.string().nullable().optional()
    })).default({}),
    {
      reducer: (current, next) => ({ ...current, ...next })
    }
  ),
  retrievedBriefs: new ReducedValue(
    z.record(z.string(), z.object({
      type: z.enum(['file', 'directory', 'repository']),
      path: z.string(),
      status: z.enum(['found', 'not_found', 'error']),
      content: z.string().optional(),
      sourceSha: z.string().nullable().optional()
    })).default({}),
    {
      reducer: (current, next) => ({ ...current, ...next })
    }
  )
})

/**
 * The model decides when it needs PR context. The outer graph owns tool routing
 * so scoped nodes can be extended with deterministic follow-up steps.
 */
const modelWithTools = codegoatModel.bindTools([getPrContextTool, getNextFilePatchTool, getBriefContextTool])

async function agentNode(state: typeof AgentState.State) {
  console.log('[state-graph.ts (agentNode)] Doing model turn')
  const response = await modelWithTools.invoke([
    new SystemMessage(codegoatPrompt),
    ...state.messages
  ])

  return { messages: [response] }
}

function routeAfterAgent(state: typeof AgentState.State) {
  const lastMessage = state.messages.at(-1)
  const message = lastMessage as {
    type?: unknown
    _getType?: () => string
    tool_calls?: Array<{ name?: unknown }>
  } | undefined
  const messageType = message?._getType?.() ?? message?.type
  const toolNames = message?.tool_calls?.map((call) => call.name).filter(Boolean) ?? []

  console.log(
    `[state-graph.ts (routeAfterAgent)] Doing route for ${String(messageType)} message with tools ${toolNames.join(',') || 'none'}`
  )

  if (messageType === 'ai' && toolNames.includes('get_pr_context')) {
    return 'list_pr_files'
  }

  if (messageType === 'ai' && toolNames.includes('get_next_file_patch')) {
    return 'get_next_file_patch'
  }

  if (messageType === 'ai' && toolNames.includes('get_brief_context')) {
    return 'get_brief_context'
  }

  return END
}

export const codeReviewGraph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('list_pr_files', listPrFilesNode as unknown as typeof AgentState.Node)
  .addNode('get_next_file_patch', getNextFilePatchNode as unknown as typeof AgentState.Node)
  .addNode('fetch_file_brief', fetchFileBriefNode as unknown as typeof AgentState.Node)
  .addNode('get_brief_context', getBriefContextNode as unknown as typeof AgentState.Node)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent, {
    list_pr_files: 'list_pr_files',
    get_next_file_patch: 'get_next_file_patch',
    get_brief_context: 'get_brief_context',
    [END]: END
  })
  .addEdge('list_pr_files', 'agent')
  .addEdge('get_next_file_patch', 'fetch_file_brief')
  .addEdge('fetch_file_brief', 'agent')
  .addEdge('get_brief_context', 'agent')
  .compile()

export type CodeReviewGraphInput = Pick<typeof AgentState.State, 'messages' | 'scope'>

/**
 * Stream model tokens and graph updates. A future Fastify route can forward
 * this iterable directly as SSE to the frontend.
 */
export function streamCodeReviewGraph(
  input: CodeReviewGraphInput,
  threadId: string,
  listPullRequestFilesRuntime?: ListPullRequestFilesRuntime,
  getFileBriefRuntime?: GetFileBriefRuntime,
  signal?: AbortSignal
) {
  console.log(`[state-graph.ts (streamCodeReviewGraph)] Doing stream for thread ${threadId}`)
  return codeReviewGraph.stream(input, {
    configurable: { thread_id: threadId, listPullRequestFilesRuntime, getFileBriefRuntime },
    streamMode: ['messages', 'updates'],
    recursionLimit: 50,
    signal
  })
}
