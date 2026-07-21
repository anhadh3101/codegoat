const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Uses Vite's local proxy when no API URL is configured, and the public API
 * service after the static site is deployed.
 */
export function apiUrl(path: string): string {
  return `${apiOrigin}${path}`
}
