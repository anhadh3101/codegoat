import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { streamCodeReviewGraph } from '../services/agent/state-graph'
import type { GetFileBriefRuntime } from '../services/briefs/get-file-brief'
import { ChatScopeSchema } from '../services/agent/scope'
import { formatCodegoatScope } from '../services/prompt/codegoat'
import type { ListPullRequestFilesRuntime } from '../services/tools/list-pr-files'
import { getGithubIntegration } from '../utils/github'

const AgentRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  scope: ChatScopeSchema
})

type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

type ConversationRow = {
  id: string
  state: unknown
  messages: unknown
}

type ConversationSummaryRow = {
  id: string
  title: string | null
  state: unknown
  messages: unknown
  created_at: string
  updated_at: string
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<ConversationMessage>
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  )
}

function toModelMessages(messages: ConversationMessage[], scope: z.infer<typeof ChatScopeSchema>) {
  return [
    new SystemMessage(formatCodegoatScope(scope)),
    ...messages.map((message) => (
    message.role === 'user'
      ? new HumanMessage(message.content)
      : new AIMessage(message.content)
    ))
  ]
}

async function persistMessages(
  fastify: FastifyInstance,
  request: FastifyRequest,
  chatId: string,
  messages: ConversationMessage[]
): Promise<void> {
  await fastify.supabaseRequest({
    method: 'PATCH',
    path: `conversations?id=eq.${encodeURIComponent(chatId)}`,
    accessToken: request.supabaseAccessToken,
    body: {
      messages,
      updated_at: new Date().toISOString()
    }
  })
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content.map((part) => {
    if (typeof part === 'string') return part
    if (!part || typeof part !== 'object') return ''
    const text = (part as { text?: unknown }).text
    return typeof text === 'string' ? text : ''
  }).join('')
}

function tokenFromStreamChunk(chunk: unknown): string {
  if (!Array.isArray(chunk)) return ''

  const messagesIndex = chunk.findIndex((value) => value === 'messages')
  if (messagesIndex === -1) return ''

  const payload = chunk[messagesIndex + 1]
  const message = Array.isArray(payload) ? payload[0] : payload
  if (!message || typeof message !== 'object') return ''
  const typedMessage = message as { _getType?: () => string; type?: unknown }
  const messageType = typedMessage._getType?.() ?? typedMessage.type
  if (messageType !== 'ai') return ''

  return textFromContent((message as { content?: unknown }).content)
}

function writeSse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export default async function agentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agent/conversations', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const userId = request.user?.id
    if (!userId) {
      return reply.code(401).send({ error: 'Authenticated user is required' })
    }

    try {
      const conversations = await fastify.supabaseRequest<ConversationSummaryRow[]>({
        path: `conversations?user_id=eq.${encodeURIComponent(userId)}&select=id,title,state,messages,created_at,updated_at&order=updated_at.desc`,
        accessToken: request.supabaseAccessToken
      })

      return {
        conversations: conversations.map(({ messages, ...conversation }) => ({
          ...conversation,
          title: conversation.title || (Array.isArray(messages)
            ? messages.find((message) => isConversationMessage(message) && message.role === 'user')?.content ?? null
            : null)
        }))
      }
    } catch (error) {
      request.log.error(error, 'Failed to list conversations')
      return reply.code(502).send({ error: 'Unable to load conversations' })
    }
  })

  fastify.get<{
    Params: { id: string }
  }>('/api/agent/conversations/:id', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const userId = request.user?.id
    const conversationId = z.string().uuid().safeParse(request.params.id)
    if (!userId || !conversationId.success) {
      return reply.code(400).send({ error: 'A valid conversation id is required' })
    }

    try {
      const conversations = await fastify.supabaseRequest<ConversationRow[]>({
        path: `conversations?id=eq.${encodeURIComponent(request.params.id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,state,messages&limit=1`,
        accessToken: request.supabaseAccessToken
      })
      const conversation = conversations[0]
      if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })

      return {
        conversation: {
          id: conversation.id,
          state: conversation.state,
          messages: Array.isArray(conversation.messages)
            ? conversation.messages.filter(isConversationMessage)
            : []
        }
      }
    } catch (error) {
      request.log.error(error, 'Failed to load conversation')
      return reply.code(502).send({ error: 'Unable to load conversation' })
    }
  })

  fastify.post('/api/agent/messages', {
    preHandler: fastify.authenticate
  }, async function (request, reply) {
    const parsed = AgentRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid agent request',
        details: parsed.error.flatten()
      })
    }

    const { message, scope: requestedScope } = parsed.data
    const userId = request.user?.id
    if (!userId) {
      return reply.code(401).send({ error: 'Authenticated user is required' })
    }

    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      createdAt: new Date().toISOString()
    }

    let activeScope = requestedScope
    let messages: ConversationMessage[]
    try {
      const existingRows = await fastify.supabaseRequest<ConversationRow[]>({
        path: `conversations?id=eq.${encodeURIComponent(requestedScope.chatId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,state,messages&limit=1`,
        accessToken: request.supabaseAccessToken
      })

      const existingConversation = existingRows[0]
      const conversationMessages = existingConversation && Array.isArray(existingConversation.messages)
        ? existingConversation.messages.filter(isConversationMessage)
        : []
      const storedScope = existingConversation
        ? ChatScopeSchema.safeParse(existingConversation.state)
        : null
      activeScope = storedScope?.success ? storedScope.data : requestedScope
      request.log.info(
        `[agent.ts (agentRoutes)] Doing scoped agent turn for ${activeScope.repository.fullName}#${activeScope.pullRequest.number}`
      )
      messages = [...conversationMessages, userMessage]

      if (!existingConversation) {
        await fastify.supabaseRequest({
          method: 'POST',
          path: 'conversations',
          accessToken: request.supabaseAccessToken,
          body: {
            id: activeScope.chatId,
            user_id: userId,
            state: activeScope,
            messages
          }
        })
      } else {
        await persistMessages(fastify, request, activeScope.chatId, messages)
      }
    } catch (error) {
      request.log.error(error, 'Failed to persist conversation message')
      return reply.code(502).send({ error: 'Unable to save the conversation message' })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    })
    const streamAbortController = new AbortController()
    const abortOnDisconnect = () => streamAbortController.abort()
    request.raw.once('aborted', abortOnDisconnect)
    reply.raw.once('close', abortOnDisconnect)

    try {
      request.log.info(
        `[agent.ts (agentRoutes)] Doing stream for chat ${activeScope.chatId}`
      )
      let listPullRequestFilesRuntime: ListPullRequestFilesRuntime | undefined
      try {
        const integration = await getGithubIntegration(fastify, request)
        if (integration?.status === 'active') {
          listPullRequestFilesRuntime = {
            composio: fastify.getComposio(),
            userId,
            connectedAccountId: integration.composio_account_id
          }
        }
      } catch (error) {
        request.log.warn(error, '[agent.ts (agentRoutes)] Doing continue without GitHub tool runtime')
      }

      const stream = await streamCodeReviewGraph({
        messages: toModelMessages(messages, activeScope),
        scope: activeScope
      }, activeScope.chatId, listPullRequestFilesRuntime, {
        userId,
        accessToken: request.supabaseAccessToken,
        supabaseRequest: fastify.supabaseRequest.bind(fastify)
      } satisfies GetFileBriefRuntime, streamAbortController.signal)

      let assistantContent = ''
      for await (const chunk of stream) {
        if (streamAbortController.signal.aborted) break

        const token = tokenFromStreamChunk(chunk)
        if (token) {
          assistantContent += token
          writeSse(reply, 'token', { token })
        }
      }

      if (assistantContent) {
        request.log.info(
          `[agent.ts (agentRoutes)] Doing persist assistant response for chat ${activeScope.chatId}`
        )
        await persistMessages(fastify, request, activeScope.chatId, [
          ...messages,
          {
            role: 'assistant',
            content: assistantContent,
            createdAt: new Date().toISOString()
          }
        ])
      }

      if (!streamAbortController.signal.aborted) {
        writeSse(reply, 'done', {})
      }
    } catch (error) {
      if (streamAbortController.signal.aborted) {
        request.log.info('Agent stream cancelled by client')
      } else {
        request.log.error(error, 'Agent stream failed')
        writeSse(reply, 'error', {
          error: 'Unable to generate an agent response'
        })
      }
    } finally {
      request.raw.off('aborted', abortOnDisconnect)
      reply.raw.off('close', abortOnDisconnect)
      if (!reply.raw.writableEnded) reply.raw.end()
    }
  })
}
