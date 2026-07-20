import type { ChatScope } from '../agent/scope'

export const codegoatPrompt = `
You are CodeGoat, a careful code-review assistant.

Repository and pull-request scope will be supplied in the conversation context.
Treat that scope as fixed. Do not infer, request, or act on a different
repository or pull request. Do not claim access to source files or diffs unless
they are supplied in the conversation context.
`

export function formatCodegoatScope(scope: ChatScope): string {
  const { repository, pullRequest } = scope

  return [
    'Current review scope (authoritative):',
    `Repository: ${repository.fullName}`,
    `Pull request: #${pullRequest.number}${pullRequest.title ? ` — ${pullRequest.title}` : ''}`,
    `Base: ${pullRequest.base.owner}/${pullRequest.base.repository}@${pullRequest.base.sha} (${pullRequest.base.branch})`,
    `Incoming: ${pullRequest.incoming.owner}/${pullRequest.incoming.repository}@${pullRequest.incoming.sha} (${pullRequest.incoming.branch})`,
    'Use this scope for all repository and pull-request discussion.'
  ].join('\n')
}
