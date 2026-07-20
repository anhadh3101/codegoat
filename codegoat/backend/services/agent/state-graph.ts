import { SystemMessage } from '@langchain/core/messages'
import { END, MessagesValue, START, StateGraph, StateSchema } from '@langchain/langgraph'
import { codegoatModel } from './codegoat'
import { listPrFilesNode } from './list-pr-files-node'
import { ChatScopeSchema } from './scope'
import { getPrContextTool } from './tools'
import type { ListPullRequestFilesRuntime } from '../tools/list-pr-files'
import { codegoatPrompt } from '../prompt/codegoat'

/**
 * The outer graph's public contract. Scope is kept in graph state so future
 * tool nodes can use the validated repository and pull-request boundary
 * without taking those values from the model.
 */
const AgentState = new StateSchema({
  messages: MessagesValue,
  scope: ChatScopeSchema
})

/**
 * The model decides when it needs PR context. The outer graph owns tool routing
 * so scoped nodes can be extended with deterministic follow-up steps.
 */
const modelWithTools = codegoatModel.bindTools([getPrContextTool])

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

  return END
}

export const codeReviewGraph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('list_pr_files', listPrFilesNode as unknown as typeof AgentState.Node)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent, {
    list_pr_files: 'list_pr_files',
    [END]: END
  })
  .addEdge('list_pr_files', 'agent')
  .compile()

export type CodeReviewGraphInput = Pick<typeof AgentState.State, 'messages' | 'scope'>

/**
 * Stream model tokens and graph updates. A future Fastify route can forward
 * this iterable directly as SSE to the frontend.
 */
export function streamCodeReviewGraph(
  input: CodeReviewGraphInput,
  threadId: string,
  listPullRequestFilesRuntime?: ListPullRequestFilesRuntime
) {
  console.log(`[state-graph.ts (streamCodeReviewGraph)] Doing stream for thread ${threadId}`)
  return codeReviewGraph.stream(input, {
    configurable: { thread_id: threadId, listPullRequestFilesRuntime },
    streamMode: ['messages', 'updates'],
    recursionLimit: 50
  })
}
