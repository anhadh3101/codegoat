import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { ChatScope, ConversationMessage, PullRequest, Repository } from '../types'

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

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '' }
    ])
    setMessage('')
    setIsSending(true)

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
        body: JSON.stringify({ message: content, scope })
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
          const data = event.split('\n').find((line) => line.startsWith('data: '))
          if (!data) continue

          const payload = JSON.parse(data.slice(6)) as { token?: string; error?: string }
          if (payload.error) throw new Error(payload.error)
          if (!payload.token) continue

          setMessages((current) => current.map((chatMessage) => (
            chatMessage.id === assistantMessageId
              ? { ...chatMessage, content: chatMessage.content + payload.token }
              : chatMessage
          )))
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to reach the agent.'
      setMessages((current) => current.map((chatMessage) => (
        chatMessage.id === assistantMessageId
          ? { ...chatMessage, content: errorMessage }
          : chatMessage
      )))
    } finally {
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
            <p className={`chat-message chat-message-${chatMessage.role}`} key={chatMessage.id}>
              {chatMessage.content || 'Thinking…'}
            </p>
          ))}
        </div>
      )}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <input aria-label="Message the repository agent" placeholder="Ask the agent anything about this pull request…" value={message} onChange={(event) => setMessage(event.target.value)} disabled={isSending} />
        <button type="submit" aria-label="Send message" disabled={!message.trim() || isSending}>{isSending ? 'Thinking…' : <>Send <span aria-hidden="true">↗</span></>}</button>
      </form>
    </div>
  )
}
