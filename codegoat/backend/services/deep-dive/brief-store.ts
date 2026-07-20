import type { FastifyInstance } from 'fastify'

export type BriefBatchRow = {
  analysis_id: number
  user_id: string
  brief_type: 'file' | 'directory' | 'repository'
  path: string
  source_sha?: string | null
  brief_markdown?: string | null
  brief_json?: Record<string, unknown> | null
}

type BriefBatchWriterOptions = {
  fastify: FastifyInstance
  accessToken: string | null
  analysisId: number
  batchSize?: number
  maxBatchBytes?: number
  maxAttempts?: number
}

const DEFAULT_BATCH_SIZE = 50
const DEFAULT_MAX_BATCH_BYTES = 512 * 1024
const DEFAULT_MAX_ATTEMPTS = 3

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class BriefBatchWriter {
  private readonly fastify: FastifyInstance
  private readonly accessToken: string | null
  private readonly analysisId: number
  private readonly batchSize: number
  private readonly maxBatchBytes: number
  private readonly maxAttempts: number
  private queue: BriefBatchRow[] = []
  private queuedBytes = 0
  private flushPromise: Promise<void> | null = null
  private flushError: Error | null = null

  constructor(options: BriefBatchWriterOptions) {
    this.fastify = options.fastify
    this.accessToken = options.accessToken
    this.analysisId = options.analysisId
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    this.maxBatchBytes = options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  }

  enqueue(row: Omit<BriefBatchRow, 'analysis_id'>): void {
    if (this.flushError) return

    // PostgREST bulk inserts require every object in the JSON array to have
    // identical keys. Explicit nulls are retained by JSON.stringify whereas
    // undefined optional properties are omitted.
    const completeRow: BriefBatchRow = {
      ...row,
      analysis_id: this.analysisId,
      source_sha: row.source_sha ?? null,
      brief_markdown: row.brief_markdown ?? null,
      brief_json: row.brief_json ?? null
    }
    this.queue.push(completeRow)
    this.queuedBytes += Buffer.byteLength(JSON.stringify(completeRow), 'utf8')

    if (this.queue.length >= this.batchSize || this.queuedBytes >= this.maxBatchBytes) {
      this.startFlush()
    }
  }

  async flush(): Promise<void> {
    if (this.flushError) throw this.flushError
    this.startFlush()
    if (this.flushPromise) await this.flushPromise
    if (this.flushError) throw this.flushError

    // A producer can enqueue while the previous flush is awaiting the network.
    if (this.queue.length > 0) await this.flush()
  }

  private startFlush(): void {
    if (this.flushPromise || this.queue.length === 0 || this.flushError) return

    this.flushPromise = this.drain()
      .catch((error) => {
        this.flushError = error instanceof Error ? error : new Error('Brief batch persistence failed')
        throw this.flushError
      })
      .finally(() => {
        this.flushPromise = null
      })

    void this.flushPromise.catch(() => undefined)
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch: BriefBatchRow[] = []
      let batchBytes = 0

      while (this.queue.length > 0 && batch.length < this.batchSize) {
        const nextRow = this.queue[0]
        const nextRowBytes = Buffer.byteLength(JSON.stringify(nextRow), 'utf8')
        if (batch.length > 0 && batchBytes + nextRowBytes > this.maxBatchBytes) break
        batch.push(this.queue.shift() as BriefBatchRow)
        batchBytes += nextRowBytes
      }

      this.queuedBytes = this.queue.reduce(
        (total, row) => total + Buffer.byteLength(JSON.stringify(row), 'utf8'),
        0
      )
      await this.persistWithRetry(batch)
    }
  }

  private async persistWithRetry(batch: BriefBatchRow[]): Promise<void> {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.fastify.supabaseRequest({
          method: 'POST',
          path: 'repository_briefs',
          accessToken: this.accessToken,
          body: batch
        })
        return
      } catch (error) {
        lastError = error
        if (attempt < this.maxAttempts) await delay(250 * (2 ** (attempt - 1)))
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Brief batch persistence failed')
  }
}
