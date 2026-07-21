import type { RepositoryTreeNode } from '../../utils/github'

const GENERATED_DIRECTORIES = new Set([
  '.cache', '.git', '.next', '.nuxt', '.terraform', '.tox', '.venv',
  '__pycache__', 'bin', 'build', 'coverage', 'dist', 'generated', 'gen',
  'obj', 'out', 'storybook-static', 'target', 'temp', 'tmp', 'vendor'
])

const DEPENDENCY_DIRECTORIES = new Set([
  '.gradle', 'bower_components', 'node_modules', 'Pods', 'site-packages',
  'third-party', 'third_party'
])

const LOCKFILES = new Set([
  'bun.lock', 'bun.lockb', 'Cargo.lock', 'composer.lock', 'Gemfile.lock',
  'go.sum', 'npm-shrinkwrap.json', 'package-lock.json', 'Pipfile.lock',
  'pnpm-lock.yaml', 'poetry.lock', 'yarn.lock'
])

const BINARY_EXTENSIONS = new Set([
  '.7z', '.avi', '.avif', '.bmp', '.class', '.dll', '.dylib', '.eot', '.gif',
  '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.mkv', '.mov', '.mp3', '.mp4',
  '.otf', '.pdf', '.png', '.rar', '.so', '.tar', '.tif', '.tiff', '.ttf',
  '.wav', '.wasm', '.webm', '.webp', '.woff', '.woff2', '.zip'
])

function pathParts(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function fileName(path: string): string {
  return pathParts(path).at(-1) ?? path
}

function extension(path: string): string {
  const name = fileName(path).toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  return dotIndex >= 0 ? name.slice(dotIndex) : ''
}

export function getFileSkipReason(
  node: RepositoryTreeNode,
  maxFileSizeBytes: number
): string | null {
  const parts = pathParts(node.path)

  if (node.type === 'tree') {
    const directory = parts.at(-1) ?? ''
    if (DEPENDENCY_DIRECTORIES.has(directory)) {
      return `Dependency directory "${directory}" is excluded.`
    }
    if (GENERATED_DIRECTORIES.has(directory)) {
      return `Generated directory "${directory}" is excluded.`
    }
    return null
  }

  if (node.type !== 'blob') return null

  if (typeof node.size === 'number' && node.size > maxFileSizeBytes) {
    return `The file exceeds the ${maxFileSizeBytes}-byte limit.`
  }

  const name = fileName(node.path)
  if (LOCKFILES.has(name)) {
    return `Lockfile "${name}" is excluded.`
  }

  if (extension(node.path) === '.map') {
    return 'Source map files are excluded.'
  }

  if (BINARY_EXTENSIONS.has(extension(node.path))) {
    return `Binary file type "${extension(node.path)}" is excluded.`
  }

  return null
}
