import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { AnalysisLoadingPage } from './components/AnalysisLoadingPage'
import { ChatPage } from './components/ChatPage'
import type { ChatScope, ConversationDetail, ConversationMessage, ConversationSummary, PullRequest, PullRequestDetails, Repository } from './types'
import './App.css'

type AuthMode = 'sign-in' | 'sign-up'

type WorkspaceStage = 'browse' | 'analyzing' | 'chat'

function SignInPage() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!isSupabaseConfigured) {
      setError('Add your Supabase URL and anon key to .env.local to enable authentication.')
      return
    }

    setIsSubmitting(true)
    const result = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (mode === 'sign-up') {
      setMessage('Account created. Check your inbox to confirm your email.')
    } else {
      window.location.assign('/index')
    }
  }

  return (
    <main className="auth-shell">
      <section className="form-panel">
        <div className="form-wrap">
          <div className="auth-brand">CodeGoat</div>
          <div className="form-heading">
            <h2>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{mode === 'sign-in' ? 'Sign in to pick up where you left off.' : 'Start building a better way to work.'}</p>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Authentication mode">
            <button className={mode === 'sign-in' ? 'active' : ''} onClick={() => switchMode('sign-in')} role="tab" aria-selected={mode === 'sign-in'}>Sign in</button>
            <button className={mode === 'sign-up' ? 'active' : ''} onClick={() => switchMode('sign-up')} role="tab" aria-selected={mode === 'sign-up'}>Sign up</button>
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />

            <div className="label-row">
              <label htmlFor="password">Password</label>
            </div>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" className="visibility-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>

            {error && <p className="form-message error" role="alert">{error}</p>}
            {message && <p className="form-message success" role="status">{message}</p>}
            <button className="submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Working...' : mode === 'sign-in' ? 'Continue to workspace  →' : 'Create account  →'}</button>
          </form>
        </div>
      </section>
    </main>
  )
}

function IndexPage() {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isGithubConnected, setIsGithubConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [repoError, setRepoError] = useState('')
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null)
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [isLoadingPullRequests, setIsLoadingPullRequests] = useState(false)
  const [pullRequestError, setPullRequestError] = useState('')
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStage>('browse')
  const [activePullRequest, setActivePullRequest] = useState<PullRequest | null>(null)
  const [chatScope, setChatScope] = useState<ChatScope | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [chatMessages, setChatMessages] = useState<ConversationMessage[]>([])
  const [conversationLoadVersion, setConversationLoadVersion] = useState(0)

  const loadConversations = async () => {
    if (!isSupabaseConfigured) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setIsLoadingConversations(true)
    try {
      const conversationsResponse = await fetch('/api/agent/conversations', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const conversationsResult = await conversationsResponse.json() as { conversations?: ConversationSummary[] }
      if (conversationsResponse.ok) {
        setConversations(Array.isArray(conversationsResult.conversations) ? conversationsResult.conversations : [])
      }
    } catch {
      // Conversation history is secondary to the repository workspace.
    } finally {
      setIsLoadingConversations(false)
    }
  }

  useEffect(() => {
    const loadGithubStatus = async () => {
      if (!isSupabaseConfigured) return

      await loadConversations()

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      try {
        const response = await fetch('/api/integrations/github/status', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        })
        const result = await response.json()

        if (!response.ok || result.connected !== true) return

        setIsGithubConnected(true)
        setIsLoadingRepos(true)

        try {
          const repositoriesResponse = await fetch('/api/repos', {
            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          })
          const repositoriesResult = await repositoriesResponse.json()

          if (!repositoriesResponse.ok) {
            setRepoError(repositoriesResult.error || 'Unable to load repositories.')
            return
          }

          setRepositories(Array.isArray(repositoriesResult.repositories) ? repositoriesResult.repositories : [])
        } catch {
          setRepoError('Unable to reach the repository service.')
        } finally {
          setIsLoadingRepos(false)
        }
      } catch {
        setIsGithubConnected(false)
      }
    }

    void loadGithubStatus()
  }, [])

  const handleConnectGitHub = async () => {
    setConnectionError('')
    setIsConnecting(true)

    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setIsConnecting(false)
      setConnectionError('Sign in before connecting GitHub.')
      return
    }

    const response = await fetch('/api/integrations/github/connect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })
    const result = await response.json()

    setIsConnecting(false)

    if (!response.ok || !result.redirectUrl) {
      setConnectionError(result.error || 'Unable to connect GitHub.')
      return
    }

    window.location.assign(result.redirectUrl)
  }

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Unable to log out:', error)
      }
    }

    window.location.assign('/signin')
  }

  const handleConversationSelect = async (conversation: ConversationSummary) => {
    setIsLoadingConversation(true)
    const summaryScope = conversation.state

    setSelectedRepository({
      id: summaryScope.repository.id,
      name: summaryScope.repository.name,
      full_name: summaryScope.repository.fullName,
      html_url: summaryScope.repository.url
    })
    setActivePullRequest({
      id: summaryScope.pullRequest.id,
      number: summaryScope.pullRequest.number,
      title: summaryScope.pullRequest.title,
      html_url: summaryScope.pullRequest.url
    })
    setChatScope(summaryScope)
    setChatMessages([])
    setWorkspaceStage('chat')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/agent/conversations/${encodeURIComponent(conversation.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const result = await response.json() as { conversation?: ConversationDetail; error?: string }
      if (!response.ok || !result.conversation) {
        console.error(result.error || 'Unable to load conversation.')
        return
      }

      const scope = result.conversation.state
      setSelectedRepository({
        id: scope.repository.id,
        name: scope.repository.name,
        full_name: scope.repository.fullName,
        html_url: scope.repository.url
      })
      setActivePullRequest({
        id: scope.pullRequest.id,
        number: scope.pullRequest.number,
        title: scope.pullRequest.title,
        html_url: scope.pullRequest.url
      })
      setChatScope(scope)
      setChatScope(scope)
      setChatMessages(result.conversation.messages)
      setConversationLoadVersion((version) => version + 1)
    } catch (error) {
      console.error('Unable to load conversation:', error)
    } finally {
      setIsLoadingConversation(false)
    }
  }

  const getRepositoryParts = (repository: Repository) => {
    const fullName = repository.full_name || repository.name || ''
    const [owner, repo] = fullName.split('/')
    return owner && repo ? { owner, repo } : null
  }

  const handleRepositorySelect = async (repository: Repository) => {
    const repositoryParts = getRepositoryParts(repository)

    if (!repositoryParts) {
      setRepoError('Unable to identify this repository.')
      return
    }

    setSelectedRepository(repository)
    setWorkspaceStage('browse')
    setActivePullRequest(null)
    setChatScope(null)
    setChatMessages([])
    setPullRequests([])
    setPullRequestError('')
    setIsLoadingPullRequests(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setPullRequestError('Your session has expired. Please sign in again.')
      setIsLoadingPullRequests(false)
      return
    }

    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(repositoryParts.owner)}/${encodeURIComponent(repositoryParts.repo)}/pulls`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const result = await response.json()

      if (!response.ok) {
        setPullRequestError(result.error || 'Unable to load pull requests.')
        return
      }

      setPullRequests(Array.isArray(result.pullRequests) ? result.pullRequests : [])
    } catch {
      setPullRequestError('Unable to reach the pull request service.')
    } finally {
      setIsLoadingPullRequests(false)
    }
  }

  const handleBackToRepositories = () => {
    setWorkspaceStage('browse')
    setSelectedRepository(null)
    setActivePullRequest(null)
    setChatScope(null)
    setChatMessages([])
    setPullRequests([])
    setPullRequestError('')
  }

  const handleBackToPullRequests = () => {
    setWorkspaceStage('browse')
    setActivePullRequest(null)
    setChatScope(null)
    setChatMessages([])
  }

  const handlePullRequestSelect = async (pullRequest: PullRequest) => {
    const repositoryParts = selectedRepository ? getRepositoryParts(selectedRepository) : null

    if (!repositoryParts || !pullRequest.number) {
      console.error('Unable to identify this pull request.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.error('Your session has expired. Please sign in again.')
      return
    }

    setActivePullRequest(pullRequest)
    setWorkspaceStage('analyzing')

    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(repositoryParts.owner)}/${encodeURIComponent(repositoryParts.repo)}/pulls/${pullRequest.number}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const responseText = await response.text()
      console.log('Pull request details raw response:', responseText)

      const result = JSON.parse(responseText) as { pullRequest?: PullRequestDetails; error?: string }

      if (!response.ok) {
        console.error('Unable to load pull request details:', result.error || result)
        setWorkspaceStage('browse')
        return
      }

      console.log('Pull request details:', JSON.stringify(result.pullRequest, null, 2))
      const details = result.pullRequest
      const baseOwner = details?.base?.repo?.owner?.login ?? repositoryParts.owner
      const baseRepository = details?.base?.repo?.name ?? repositoryParts.repo
      const incomingOwner = details?.head?.repo?.owner?.login ?? baseOwner
      const incomingRepository = details?.head?.repo?.name ?? baseRepository
      const baseBranch = details?.base?.ref
      const baseSha = details?.base?.sha
      const incomingBranch = details?.head?.ref
      const incomingSha = details?.head?.sha

      if (!baseBranch || !baseSha || !incomingBranch || !incomingSha) {
        console.error('Pull request details are missing branch metadata:', details)
        setWorkspaceStage('browse')
        return
      }

      setChatScope({
        chatId: crypto.randomUUID(),
        repository: {
          id: details?.base?.repo?.id ?? selectedRepository?.id,
          owner: baseOwner,
          name: baseRepository,
          fullName: `${baseOwner}/${baseRepository}`,
          url: details?.base?.repo?.html_url ?? selectedRepository?.html_url
        },
        pullRequest: {
          id: details?.id ?? pullRequest.id,
          number: pullRequest.number,
          title: details?.title ?? pullRequest.title,
          url: details?.html_url ?? pullRequest.html_url,
          base: {
            owner: baseOwner,
            repository: baseRepository,
            branch: baseBranch,
            sha: baseSha
          },
          incoming: {
            owner: incomingOwner,
            repository: incomingRepository,
            branch: incomingBranch,
            sha: incomingSha
          }
        }
      })
      setChatMessages([])
      setWorkspaceStage('chat')
    } catch (error) {
      console.error('Unable to reach the pull request details service:', error)
      setWorkspaceStage('browse')
    }
  }

  return (
    <main className="index-page">
      <aside className="chat-sidebar" aria-label="Chat history">
        <a className="workspace-brand" href="/" aria-label="CodeGoat home">
          <span>Code</span><span>Goat</span>
        </a>

        <div className="chat-list" aria-label="Saved chats">
          <p className="chat-list-label">History</p>
          {isLoadingConversations && <p className="chat-list-state">Loading…</p>}
          {!isLoadingConversations && conversations.length === 0 && <p className="chat-list-state">No conversations yet.</p>}
          {!isLoadingConversations && conversations.map((conversation) => {
            const scope = conversation.state
            const repository = scope?.repository?.fullName || 'Repository'
            const pullRequest = scope?.pullRequest
            const title = conversation.title || 'Conversation'

            return (
              <button className="chat-list-item" key={conversation.id} type="button" onClick={() => void handleConversationSelect(conversation)} disabled={isLoadingConversation}>
                <span className="chat-list-item-title">{title}</span>
                <span className="chat-list-item-context">{repository} · #{pullRequest?.number ?? '—'}</span>
              </button>
            )
          })}
        </div>

        <button className="logout-button" type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </aside>

      <section className="workspace-shell" aria-label="Workspace">
        <div className="workspace-header">
          <div className="workspace-actions">
            <div className={`workspace-action-buttons${workspaceStage === 'chat' || (workspaceStage === 'browse' && selectedRepository) ? ' has-back' : ''}`}>
              {workspaceStage === 'chat' && (
                <button className="back-button workspace-back-button" type="button" onClick={handleBackToPullRequests}>
                  ← Back to pull requests
                </button>
              )}
              {workspaceStage === 'browse' && selectedRepository && (
                <button className="back-button workspace-back-button" type="button" onClick={handleBackToRepositories}>
                  ← All repositories
                </button>
              )}
              <button className={`connect-github-button${isGithubConnected ? ' is-connected' : ''}`} type="button" onClick={handleConnectGitHub} disabled={isConnecting || isGithubConnected}>
                {isConnecting ? 'Connecting...' : isGithubConnected ? (
                  <img src="/GitHub_Invertocat_Black.svg" alt="GitHub connected" />
                ) : 'Connect GitHub'}
              </button>
            </div>
            {connectionError && <p className="connection-error" role="alert">{connectionError}</p>}
          </div>
        </div>

        <div className="index-content" aria-label="CodeGoat workspace">
          {!isGithubConnected && workspaceStage !== 'chat' && (
            <div className="workspace-empty-state">
              <h1>Connect GitHub</h1>
              <p>Choose a repository to begin.</p>
            </div>
          )}

          {isGithubConnected && workspaceStage === 'analyzing' && selectedRepository && activePullRequest && (
            <AnalysisLoadingPage />
          )}

          {workspaceStage === 'chat' && selectedRepository && activePullRequest && chatScope && (
            <ChatPage
              key={`${chatScope.chatId}-${conversationLoadVersion}`}
              repository={selectedRepository}
              pullRequest={activePullRequest}
              scope={chatScope}
              initialMessages={chatMessages}
              onConversationSaved={() => void loadConversations()}
            />
          )}

          {isGithubConnected && workspaceStage === 'browse' && !selectedRepository && (
            <div className="repository-page">
              <div className="repository-page-header">
                <div>
                  <p className="eyebrow">GitHub workspace</p>
                  <h1>My Repositories</h1>
                </div>
                <span className="repository-count">{repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'}</span>
              </div>

              {isLoadingRepos && <div className="repo-state"><span className="loading-dot" aria-hidden="true" /> Loading repositories...</div>}
              {!isLoadingRepos && repoError && <p className="repo-state repo-state-error" role="alert">{repoError}</p>}
              {!isLoadingRepos && !repoError && repositories.length === 0 && <p className="repo-state">No repositories found for this GitHub account.</p>}
              {!isLoadingRepos && !repoError && repositories.length > 0 && (
                <ul className="repo-list">
                  {repositories.map((repository, index) => (
                    <li key={repository.id ?? repository.full_name ?? repository.name ?? index}>
                      <button className="repo-item repo-select-button" type="button" onClick={() => void handleRepositorySelect(repository)}>
                        <span className="repo-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false">
                            <path d="M4.5 6.5h5l1.8 2h8.2v9.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V6.5Z" />
                            <path d="M4.5 9h15" />
                          </svg>
                        </span>
                        <span className="repo-copy">
                          <span className="repo-name">{repository.full_name || repository.name || 'Untitled repository'}</span>
                          <span className="repo-description">{repository.description || 'No description provided'}</span>
                        </span>
                        <span className="repo-select-affordance" aria-hidden="true">View PRs →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isGithubConnected && workspaceStage === 'browse' && selectedRepository && (
            <div className="repository-page pull-request-page">
              <div className="repository-page-header">
                <div>
                  <p className="eyebrow">Pull requests</p>
                  <h1>{selectedRepository.full_name || selectedRepository.name || 'Repository'}</h1>
                </div>
                {!isLoadingPullRequests && !pullRequestError && <span className="repository-count">{pullRequests.length} active {pullRequests.length === 1 ? 'PR' : 'PRs'}</span>}
              </div>

              {isLoadingPullRequests && <div className="repo-state"><span className="loading-dot" aria-hidden="true" /> Loading active pull requests...</div>}
              {!isLoadingPullRequests && pullRequestError && <p className="repo-state repo-state-error" role="alert">{pullRequestError}</p>}
              {!isLoadingPullRequests && !pullRequestError && pullRequests.length === 0 && <p className="repo-state">No active pull requests in this repository.</p>}
              {!isLoadingPullRequests && !pullRequestError && pullRequests.length > 0 && (
                <ul className="repo-list pull-request-list">
                  {pullRequests.map((pullRequest, index) => (
                    <li key={pullRequest.id ?? pullRequest.number ?? index}>
                      <a className="repo-item pull-request-item" href={pullRequest.html_url || '#'} target="_blank" rel="noreferrer" onClick={(event) => {
                        event.preventDefault()
                        void handlePullRequestSelect(pullRequest)
                      }}>
                        <span className="pr-number">#{pullRequest.number ?? '—'}</span>
                        <span className="repo-copy">
                          <span className="repo-name">{pullRequest.title || 'Untitled pull request'}{pullRequest.draft ? <span className="draft-badge">Draft</span> : null}</span>
                          <span className="repo-description">{pullRequest.user?.login ? `Opened by ${pullRequest.user.login}` : 'Open pull request'}</span>
                        </span>
                        <span className="repo-select-affordance" aria-hidden="true">Start Review</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function App() {
  return window.location.pathname === '/signin' ? <SignInPage /> : <IndexPage />
}

export default App
