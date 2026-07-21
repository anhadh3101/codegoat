import { ToolMessage, type AIMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import {
  listPullRequestFiles,
  type ListPullRequestFilesRuntime
} from '../tools/list-pr-files'
import type { ChatScope } from './scope'

type ListPrFilesNodeState = {
  messages: unknown[]
  scope: ChatScope
}

type ListPrFilesNodeConfig = RunnableConfig & {
  configurable?: RunnableConfig['configurable'] & {
    listPullRequestFilesRuntime?: ListPullRequestFilesRuntime
  }
}

function getToolCallId(messages: unknown[]): string {
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined
  const toolCall = lastMessage?.tool_calls?.find((call) => call.name === 'get_pr_context')
  if (!toolCall?.id) throw new Error('The PR files node requires a get_pr_context tool call')
  return toolCall.id
}

export async function listPrFilesNode(
  state: ListPrFilesNodeState,
  config: ListPrFilesNodeConfig
) {
  const toolCallId = getToolCallId(state.messages)
  const runtime = config.configurable?.listPullRequestFilesRuntime
  if (!runtime) {
    return {
      messages: [new ToolMessage({
        tool_call_id: toolCallId,
        content: 'Pull-request files are unavailable because GitHub is not connected for this chat.'
      })],
      changedFiles: [],
      nextFileIndex: 0,
      activeFilePath: null
    }
  }

  console.log(
    `[list-pr-files-node.ts (listPrFilesNode)] Doing list files for ${state.scope.repository.fullName}#${state.scope.pullRequest.number}`
  )
  try {
    const { responses, changedFiles } = await listPullRequestFiles(state.scope, runtime)
    console.log(
      `[list-pr-files-node.ts (listPrFilesNode)] Doing return ${changedFiles.length} changed files from ${responses.length} raw Composio responses`
    )

    return {
      changedFiles,
      nextFileIndex: 0,
      activeFilePath: null,
      fileBriefs: {},
      messages: [new ToolMessage({
        tool_call_id: toolCallId,
        content: JSON.stringify({ responses })
      })]
    }
  } catch (error) {
    console.error('[list-pr-files-node.ts (listPrFilesNode)] Doing handle PR file lookup failure', error)
    return {
      messages: [new ToolMessage({
        tool_call_id: toolCallId,
        content: 'Pull-request files could not be loaded. Explain that GitHub context is currently unavailable.'
      })],
      changedFiles: [],
      nextFileIndex: 0,
      activeFilePath: null,
      fileBriefs: {}
    }
  }
}
