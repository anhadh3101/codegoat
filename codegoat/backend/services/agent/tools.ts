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
