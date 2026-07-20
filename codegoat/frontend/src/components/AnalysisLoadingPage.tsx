import type { PullRequest, Repository } from '../types'

type AnalysisLoadingPageProps = {
  repository: Repository
  pullRequest: PullRequest
}

export function AnalysisLoadingPage({ repository, pullRequest }: AnalysisLoadingPageProps) {
  return (
    <div className="analysis-loading-page" role="status" aria-live="polite">
      <div className="analysis-loading-main">
        <div className="analysis-spinner" aria-hidden="true" />
        <p className="eyebrow">Repository analysis</p>
        <h1>Preparing your workspace.</h1>
        <p className="analysis-loading-copy">
          Reading <strong>{repository.full_name || repository.name}</strong> for your pull request.
        </p>
        <p className="analysis-loading-status">#{pullRequest.number ?? '—'} · Mapping files and dependencies</p>
      </div>
    </div>
  )
}
