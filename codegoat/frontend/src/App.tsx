import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import './App.css'

type AuthMode = 'sign-in' | 'sign-up'

type Repository = {
  id?: number | string
  name?: string
  full_name?: string
  description?: string | null
  private?: boolean
  language?: string | null
  html_url?: string
  updated_at?: string
}

type PullRequest = {
  id?: number | string
  number?: number
  title?: string
  body?: string | null
  user?: { login?: string; avatar_url?: string }
  html_url?: string
  updated_at?: string
  draft?: boolean
}

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
      setMessage('Signed in successfully.')
    }
  }

  return (
    <main className="auth-shell">
      <section className="form-panel">
        <div className="form-wrap">
          <div className="brand-mark" aria-label="Codegoat">cg</div>
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
              {mode === 'sign-in' && <button type="button" className="text-button" onClick={() => setMessage('Password reset will be available once email recovery is configured.')}>Forgot password?</button>}
            </div>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" className="visibility-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>

            {error && <p className="form-message error" role="alert">{error}</p>}
            {message && <p className="form-message success" role="status">{message}</p>}
            <button className="submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Working...' : mode === 'sign-in' ? 'Continue to workspace  →' : 'Create account  →'}</button>
          </form>

          <p className="legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
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

  useEffect(() => {
    const loadGithubStatus = async () => {
      if (!isSupabaseConfigured) return

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
    setSelectedRepository(null)
    setPullRequests([])
    setPullRequestError('')
  }

  return (
    <main className="index-page">
      <aside className="chat-sidebar" aria-label="Chat history">
        <div className="chat-list" aria-label="Saved chats" />

        <button className="logout-button" type="button" onClick={handleLogout}>Log out</button>
      </aside>

      <section className="workspace-shell" aria-label="Workspace">
        <div className="workspace-header">
          <a className="workspace-brand" href="/" aria-label="CodeGoat home">
            <span>Code</span><span>Goat</span>
          </a>

          <div className="workspace-actions">
            <div className="workspace-action-buttons">
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
          {!isGithubConnected && (
            <div className="workspace-empty-state">
              <p className="eyebrow">GitHub workspace</p>
              <h1>Connect GitHub to get started</h1>
              <p>Connect your account to see your repositories and choose where to begin.</p>
            </div>
          )}

          {isGithubConnected && !selectedRepository && (
            <div className="repository-page">
              <div className="repository-page-header">
                <div>
                  <p className="eyebrow">GitHub workspace</p>
                  <h1>Your repositories</h1>
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
                        <span className="repo-icon" aria-hidden="true">⌁</span>
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

          {isGithubConnected && selectedRepository && (
            <div className="repository-page pull-request-page">
              <button className="back-button" type="button" onClick={handleBackToRepositories}>← All repositories</button>
              <div className="repository-page-header">
                <div>
                  <p className="eyebrow">Configuration · Pull requests</p>
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
                      <a className="repo-item pull-request-item" href={pullRequest.html_url || '#'} target="_blank" rel="noreferrer">
                        <span className="pr-number">#{pullRequest.number ?? '—'}</span>
                        <span className="repo-copy">
                          <span className="repo-name">{pullRequest.title || 'Untitled pull request'}{pullRequest.draft ? <span className="draft-badge">Draft</span> : null}</span>
                          <span className="repo-description">{pullRequest.user?.login ? `Opened by ${pullRequest.user.login}` : 'Open pull request'}</span>
                        </span>
                        <span className="repo-select-affordance" aria-hidden="true">Open ↗</span>
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
