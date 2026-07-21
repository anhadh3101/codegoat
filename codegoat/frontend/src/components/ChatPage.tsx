import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { ChatScope, ConversationMessage, ModelTurnEvent, PullRequest, Repository } from '../types'

type ChatPageProps = {
  repository: Repository
  pullRequest: PullRequest
  scope: ChatScope
  initialMessages?: ConversationMessage[]
  onConversationSaved: () => void
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function ChatPage({ repository, pullRequest, scope, initialMessages = [], onConversationSaved }: ChatPageProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map((chatMessage) => ({
    id: crypto.randomUUID(),
    role: chatMessage.role,
    content: chatMessage.content
  })))
  const [isSending, setIsSending] = useState(false)
  const [modelTurns, setModelTurns] = useState<ModelTurnEvent[]>([])
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  const handleAbort = () => {
    abortControllerRef.current?.abort()
  }


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = message.trim()
    if (!content || isSending) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content
    }
    const assistantMessageId = crypto.randomUUID()
    const abortController = new AbortController()

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '' }
    ])
    setMessage('')
    setModelTurns([])
    setActiveAssistantMessageId(assistantMessageId)
    setIsSending(true)
    abortControllerRef.current = abortController

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired. Please sign in again.')

      const response = await fetch('/api/agent/messages', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: content, scope }),
        signal: abortController.signal
      })

      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(error?.error || 'Unable to start the agent response.')
      }

      onConversationSaved()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const lines = event.split('\n')
          const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message'
          const data = lines.find((line) => line.startsWith('data: '))
          if (!data) continue

          const payload = JSON.parse(data.slice(6)) as { token?: string; error?: string } & Partial<ModelTurnEvent>
          if (eventName === 'model_turn' && typeof payload.sequence === 'number' && Array.isArray(payload.toolCalls)) {
            setModelTurns((current) => [...current, payload as ModelTurnEvent])
            continue
          }
          if (payload.error) throw new Error(payload.error)
          if (eventName !== 'token' || !payload.token) continue

          setMessages((current) => current.map((chatMessage) => (
            chatMessage.id === assistantMessageId
              ? { ...chatMessage, content: chatMessage.content + payload.token }
              : chatMessage
          )))
        }
      }

    } catch (error) {
      if (abortController.signal.aborted) {
        setMessages((current) => current.map((chatMessage) => (
          chatMessage.id === assistantMessageId && !chatMessage.content
            ? { ...chatMessage, content: 'Response stopped.' }
            : chatMessage
        )))
        return
      }

      const errorMessage = error instanceof Error ? error.message : 'Unable to reach the agent.'
      setMessages((current) => current.map((chatMessage) => (
        chatMessage.id === assistantMessageId
          ? { ...chatMessage, content: errorMessage }
          : chatMessage
      )))
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }

  return (
    <div className="dummy-chat-page" data-chat-id={scope.chatId}>
      <div className="chat-context-strip">
        <span className="chat-context-repo">{repository.full_name || repository.name}</span>
        <span className="chat-context-divider">/</span>
        <span className="chat-context-pr">#{pullRequest.number ?? '—'} {pullRequest.title || 'Pull request'}</span>
      </div>

      {messages.length === 0 ? (
        <div className="chat-empty-state">
          <p className="chat-greeting">“Let’s find the bugs before they find your users.”</p>
        </div>
      ) : (
        <div className="chat-messages" aria-live="polite">
          {messages.map((chatMessage) => (
            <Fragment key={chatMessage.id}>
              {chatMessage.id === activeAssistantMessageId && modelTurns.map((turn) => (
                <ModelTurn key={`${turn.sequence}-${turn.createdAt}`} turn={turn} />
              ))}
              <p className={`chat-message chat-message-${chatMessage.role}`}>
                {chatMessage.content || 'Thinking…'}
              </p>
            </Fragment>
          ))}
        </div>
      )}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <input aria-label="Message the repository agent" placeholder="Ask the agent anything about this pull request…" value={message} onChange={(event) => setMessage(event.target.value)} disabled={isSending} />
        {isSending ? (
          <button className="chat-stop-button" type="button" onClick={handleAbort} aria-label="Stop generating"><span aria-hidden="true">■</span></button>
        ) : (
          <button type="submit" aria-label="Send message" disabled={!message.trim()}>Send <span aria-hidden="true">↗</span></button>
        )}
      </form>
    </div>
  )
}

function friendlyToolName(name: string): string {
  const labels: Record<string, string> = {
    get_pr_context: 'Look up pull request files',
    get_next_file_patch: 'Read the next file patch',
    get_brief_context: 'Load repository context'
  }
  return labels[name] ?? name.replaceAll('_', ' ')
}

function ModelTurn({ turn }: { turn: ModelTurnEvent }) {
  const hasTools = turn.toolCalls.length > 0
  const summary = hasTools
    ? `Requested ${turn.toolCalls.length === 1 ? 'a tool' : `${turn.toolCalls.length} tools`}`
    : turn.content ? 'Generated a response' : 'Completed a model turn'

  return (
    <details className="model-turn">
      <summary className="model-turn-summary">
        <span className="model-turn-title">Agent turn {turn.sequence}</span>
        <span className="model-turn-action">{summary}</span>
      </summary>
      <div className="model-turn-body">
        {hasTools && (
          <div className="model-turn-tools">
            <span className="model-turn-label">Tool request</span>
            {turn.toolCalls.map((tool, index) => (
              <span className="model-turn-tool" key={`${tool.name}-${index}`}>{friendlyToolName(tool.name)}</span>
            ))}
          </div>
        )}
        {turn.content && <p className="model-turn-content">{turn.content}</p>}
        {!turn.content && !hasTools && <p className="model-turn-empty">No visible model text for this turn.</p>}
      </div>
    </details>
  )
}
