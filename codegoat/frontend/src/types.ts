export type Repository = {
  id?: number | string
  name?: string
  full_name?: string
  description?: string | null
  private?: boolean
  language?: string | null
  html_url?: string
  updated_at?: string
}

export type PullRequest = {
  id?: number | string
  number?: number
  title?: string
  body?: string | null
  user?: { login?: string; avatar_url?: string }
  html_url?: string
  updated_at?: string
  draft?: boolean
}

type PullRequestRepositoryRef = {
  id?: number | string
  name?: string
  full_name?: string
  html_url?: string
  owner?: { login?: string }
}

export type PullRequestDetails = PullRequest & {
  base?: {
    ref?: string
    sha?: string
    repo?: PullRequestRepositoryRef
  }
  head?: {
    ref?: string
    sha?: string
    repo?: PullRequestRepositoryRef
  }
}

export type ChatScope = {
  chatId: string
  repository: {
    id?: number | string
    owner: string
    name: string
    fullName: string
    url?: string
  }
  pullRequest: {
    id?: number | string
    number: number
    title?: string
    url?: string
    base: {
      owner: string
      repository: string
      branch: string
      sha: string
    }
    incoming: {
      owner: string
      repository: string
      branch: string
      sha: string
    }
  }
}

export type ConversationSummary = {
  id: string
  title?: string | null
  state: ChatScope
  created_at: string
  updated_at: string
}

export type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type ConversationDetail = {
  id: string
  state: ChatScope
  messages: ConversationMessage[]
}

export type ModelTurnEvent = {
  sequence: number
  content: string
  toolCalls: Array<{ name: string }>
  createdAt: string
}
