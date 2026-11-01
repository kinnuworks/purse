/** Retry helpers for public RPC endpoints that answer 429 when asked too fast. */

type ErrorLike = {
  status?: unknown
  code?: unknown
  message?: unknown
  details?: unknown
  shortMessage?: unknown
  cause?: unknown
  headers?: { get?: (name: string) => string | null }
}

function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = []
  let current: unknown = error
  for (let i = 0; i < 6 && current && typeof current === 'object'; i++) {
    out.push(current)
    current = (current as ErrorLike).cause
  }
  return out
}

function textOf(error: unknown): string {
  return chain(error)
    .map((e) => [e.message, e.details, e.shortMessage].filter((v) => typeof v === 'string').join(' '))
    .join(' ')
    .toLowerCase()
}

export function isRateLimited(error: unknown): boolean {
  if (chain(error).some((e) => e.status === 429 || e.code === 429)) return true
  return /\b429\b|too many requests|rate.?limit/.test(textOf(error))
}

/** The node refused the window as too wide or too heavy; a smaller window may work. */
export function isRangeTooLarge(error: unknown): boolean {
  if (isRateLimited(error)) return false
  return /block range|range (is )?too|too (large|wide|many)|exceed|more than \d+ results|limit of \d+|query returned more|response size/.test(
    textOf(error),
  )
}

function retryAfterMs(error: unknown): number | null {
  for (const e of chain(error)) {
    const header = e.headers?.get?.('retry-after')
    if (header) {
      const seconds = Number(header)
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    }
  }
  return null
}

export interface RetryOptions {
  retries?: number
  baseMs?: number
  maxMs?: number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  onRetry?: (attempt: number, delayMs: number) => void
}

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Runs fn, retrying with exponential backoff only when the node says 429. Other errors pass straight through. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 6, baseMs = 400, maxMs = 8000, sleep = realSleep, random = Math.random, onRetry } = options
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!isRateLimited(error) || attempt >= retries) throw error
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt)
      const delay = Math.max(retryAfterMs(error) ?? 0, backoff + Math.floor(random() * baseMs))
      onRetry?.(attempt + 1, delay)
      await sleep(delay)
    }
  }
}

/** Runs fn over items with at most `limit` in flight, keeping result order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
