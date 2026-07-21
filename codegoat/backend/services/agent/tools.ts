import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * This exposes the capability to the model. The outer graph, rather than the
 * tool callback, executes the scoped Composio request.
 */
export const getPrContextTool = tool(
  async () => '',
  {
    name: 'get_pr_context',
    description: 'List files changed in the pull request for the current chat scope. Use this when pull-request file context is needed.',
    schema: z.object({})
  }
)

/**
 * Delivers the next stored PR patch. The graph chooses the file from state so
 * the model cannot request an arbitrary repository path.
 */
export const getNextFilePatchTool = tool(
  async () => '',
  {
    name: 'get_next_file_patch',
    description: 'Load the next changed file patch from the current pull request. Call this after reviewing the previous patch to continue the review.',
    schema: z.object({})
  }
)

export const BriefContextTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
  z.object({ type: z.literal('directory'), path: z.string().min(1) }),
  z.object({ type: z.literal('repository') })
])

export const BriefContextRequestSchema = z.object({
  targets: z.array(BriefContextTargetSchema).min(1).max(3),
  reason: z.string().min(1).max(500)
})

/**
 * Lets the model request a small amount of additional, scoped repository
 * context when the active patch and file brief are insufficient.
 */
export const getBriefContextTool = tool(
  async () => '',
  {
    name: 'get_brief_context',
    description: 'Retrieve up to three exact file, directory, or repository briefs from the current repository base snapshot. Use this only when more repository context is needed.',
    schema: BriefContextRequestSchema
  }
)
