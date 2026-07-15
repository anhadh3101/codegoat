import { useState } from 'react'
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
  const [connectionError, setConnectionError] = useState('')
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [repoError, setRepoError] = useState('')

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

  const handleOpenRepositories = async () => {
    setIsRepoModalOpen(true)
    setIsLoadingRepos(true)
    setRepoError('')

    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setIsLoadingRepos(false)
      setRepoError('Sign in before viewing repositories.')
      return
    }

    try {
      const response = await fetch('/api/repos', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      const result = await response.json()

      if (!response.ok) {
        setRepoError(result.error || 'Unable to load repositories.')
        return
      }

      setRepositories(Array.isArray(result.repositories) ? result.repositories : [])
    } catch {
      setRepoError('Unable to reach the repository service.')
    } finally {
      setIsLoadingRepos(false)
    }
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
              <button className="add-repo-button" type="button" onClick={handleOpenRepositories}>
                <span aria-hidden="true">＋</span> Add Repo
              </button>
              <button className="connect-github-button" type="button" onClick={handleConnectGitHub} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect GitHub'}
              </button>
            </div>
            {connectionError && <p className="connection-error" role="alert">{connectionError}</p>}
          </div>
        </div>

        <div className="index-content" aria-label="CodeGoat workspace" />
      </section>

      {isRepoModalOpen && (
        <div className="repo-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsRepoModalOpen(false)
        }}>
          <section className="repo-modal" role="dialog" aria-modal="true" aria-labelledby="repo-modal-title">
            <div className="repo-modal-header">
              <div>
                <p className="eyebrow">GitHub workspace</p>
                <h2 id="repo-modal-title">Add a repository</h2>
              </div>
              <button className="modal-close-button" type="button" onClick={() => setIsRepoModalOpen(false)} aria-label="Close repository picker">×</button>
            </div>

            {isLoadingRepos && <div className="repo-state"><span className="loading-dot" aria-hidden="true" /> Loading repositories...</div>}
            {!isLoadingRepos && repoError && <p className="repo-state repo-state-error" role="alert">{repoError}</p>}
            {!isLoadingRepos && !repoError && repositories.length === 0 && <p className="repo-state">No repositories found for this GitHub account.</p>}
            {!isLoadingRepos && !repoError && repositories.length > 0 && (
              <ul className="repo-list">
                {repositories.map((repository, index) => (
                  <li key={repository.id ?? repository.full_name ?? repository.name ?? index}>
                    <a className="repo-item" href={repository.html_url || '#'} target="_blank" rel="noreferrer">
                      <span className="repo-icon" aria-hidden="true">⌁</span>
                      <span className="repo-copy">
                        <span className="repo-name">{repository.full_name || repository.name || 'Untitled repository'}</span>
                        <span className="repo-description">{repository.description || 'No description provided'}</span>
                      </span>
                      <span className={`repo-visibility ${repository.private ? 'is-private' : ''}`}>{repository.private ? 'Private' : 'Public'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

function App() {
  return window.location.pathname === '/signin' ? <SignInPage /> : <IndexPage />
}

export default App
