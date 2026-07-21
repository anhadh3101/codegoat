import { ToolMessage, type AIMessage } from '@langchain/core/messages'

type ChangedFile = {
  path: string
  status?: string
  previousPath?: string
  patch?: string
}

type GetNextFilePatchNodeState = {
  messages: unknown[]
  changedFiles: ChangedFile[]
  nextFileIndex: number
}

function getToolCallId(messages: unknown[]): string {
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined
  const toolCall = lastMessage?.tool_calls?.find((call) => call.name === 'get_next_file_patch')
  if (!toolCall?.id) throw new Error('The next file patch node requires a get_next_file_patch tool call')
  return toolCall.id
}

/**
 * Return exactly one already-stored patch to the model and move the review
 * cursor forward. This node intentionally makes no GitHub request.
 */
export async function getNextFilePatchNode(state: GetNextFilePatchNodeState) {
  const toolCallId = getToolCallId(state.messages)
  const file = state.changedFiles[state.nextFileIndex]

  if (!file) {
    return {
      activeFilePath: null,
      messages: [new ToolMessage({
        tool_call_id: toolCallId,
        content: 'No changed files remain in this pull request.'
      })]
    }
  }

  const patchAvailable = typeof file.patch === 'string' && file.patch.length > 0
  console.log(
    `[get-next-file-patch-node.ts (getNextFilePatchNode)] Delivering ${file.path} at index ${state.nextFileIndex}; patch available: ${patchAvailable}`
  )

  return {
    nextFileIndex: state.nextFileIndex + 1,
    activeFilePath: file.path,
    messages: [new ToolMessage({
      tool_call_id: toolCallId,
      content: JSON.stringify({
        file: {
          path: file.path,
          ...(file.status ? { status: file.status } : {}),
          ...(file.previousPath ? { previousPath: file.previousPath } : {})
        },
        patchAvailable,
        ...(patchAvailable
          ? { patch: file.patch }
          : { note: 'GitHub did not provide a textual patch for this file. It may be binary or the patch may be unavailable.' })
      })
    })]
  }
}
