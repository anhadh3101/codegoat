export function AnalysisLoadingPage() {
  return (
    <div className="analysis-loading-page" role="status" aria-live="polite">
      <div className="analysis-loading-main">
        <div className="analysis-spinner" aria-hidden="true" />
        <h1>Reviewing your pull request</h1>
        <p className="analysis-loading-copy">Mapping the changes.</p>
      </div>
    </div>
  )
}
