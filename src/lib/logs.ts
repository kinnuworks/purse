import { deserializeEvents, eventKey, serializeEvents, sortEvents, type PurseEvent } from './events'
import { isRangeTooLarge, mapLimit, withRetry, type RetryOptions } from './retry'

/**
 * Reads the Purse event history in small block windows, retrying on 429, and keeps
 * what it has read in localStorage so the next visit only reads new blocks.
 * The RPC and the storage are passed in, so the reader runs the same in tests.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface HistoryOptions {
  fetchRange: (from: bigint, to: bigint) => Promise<PurseEvent[]>
  getHead: () => Promise<bigint>
  deployBlock: bigint
  /** Blocks per query. A window the node refuses as too large is split in half. */
  range: bigint
  storage?: KeyValueStore | null
  cacheKey: string
  concurrency?: number
  retry?: RetryOptions
  onProgress?: (progress: { scannedTo: bigint; head: bigint }) => void
  shouldStop?: () => boolean
}

export interface HistoryResult {
  events: PurseEvent[]
  /** Last block that has been read completely. */
  scannedTo: bigint
  head: bigint
}

interface CacheShape {
  v: 1
  scannedTo: string
  events: string
}

function loadCache(storage: KeyValueStore | null | undefined, key: string): { scannedTo: bigint; events: PurseEvent[] } | null {
  if (!storage) return null
  try {
    const text = storage.getItem(key)
    if (!text) return null
    const parsed = JSON.parse(text) as Partial<CacheShape>
    if (parsed.v !== 1 || typeof parsed.scannedTo !== 'string' || typeof parsed.events !== 'string') return null
    return { scannedTo: BigInt(parsed.scannedTo), events: deserializeEvents(parsed.events) }
  } catch {
    return null
  }
}

function saveCache(storage: KeyValueStore | null | undefined, key: string, scannedTo: bigint, events: PurseEvent[]) {
  if (!storage) return
  try {
    const value: CacheShape = { v: 1, scannedTo: scannedTo.toString(), events: serializeEvents(events) }
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the history still works, it just is not remembered.
  }
}

/** What is already remembered, so a page can show it before the network answers. */
export function readCachedHistory(storage: KeyValueStore | null | undefined, cacheKey: string): HistoryResult | null {
  const cached = loadCache(storage, cacheKey)
  return cached ? { events: sortEvents(cached.events), scannedTo: cached.scannedTo, head: cached.scannedTo } : null
}

export async function readHistory(options: HistoryOptions): Promise<HistoryResult> {
  const { fetchRange, getHead, deployBlock, range, storage, cacheKey, concurrency = 3, retry, onProgress, shouldStop } = options
  if (range < 1n) throw new Error('Log range must be at least one block')

  const cached = loadCache(storage, cacheKey)
  const byKey = new Map<string, PurseEvent>((cached?.events ?? []).map((e) => [eventKey(e), e]))
  const head = await withRetry(getHead, retry)

  let scannedTo = cached ? cached.scannedTo : deployBlock - 1n
  const start = scannedTo + 1n < deployBlock ? deployBlock : scannedTo + 1n

  const fetchWindow = async (from: bigint, to: bigint): Promise<PurseEvent[]> => {
    try {
      return await withRetry(() => fetchRange(from, to), retry)
    } catch (error) {
      if (from < to && isRangeTooLarge(error)) {
        const mid = from + (to - from) / 2n
        const left = await fetchWindow(from, mid)
        const right = await fetchWindow(mid + 1n, to)
        return [...left, ...right]
      }
      throw error
    }
  }

  const windows: Array<[bigint, bigint]> = []
  for (let from = start; from <= head; from += range) {
    const to = from + range - 1n
    windows.push([from, to > head ? head : to])
  }

  onProgress?.({ scannedTo, head })
  for (let i = 0; i < windows.length; i += concurrency) {
    if (shouldStop?.()) break
    const batch = windows.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(([from, to]) => fetchWindow(from, to)))
    for (const found of results) for (const event of found) byKey.set(eventKey(event), event)
    scannedTo = batch[batch.length - 1][1]
    saveCache(storage, cacheKey, scannedTo, [...byKey.values()])
    onProgress?.({ scannedTo, head })
  }

  return { events: sortEvents([...byKey.values()]), scannedTo, head }
}

export interface BlockTimeOptions {
  blocks: bigint[]
  fetchTime: (block: bigint) => Promise<number>
  storage?: KeyValueStore | null
  cacheKey: string
  concurrency?: number
  retry?: RetryOptions
}

/** Block timestamps (seconds) for the given blocks, remembered in localStorage. Keys are block numbers as strings. */
export async function readBlockTimes(options: BlockTimeOptions): Promise<Record<string, number>> {
  const { blocks, fetchTime, storage, cacheKey, concurrency = 4, retry } = options
  let known: Record<string, number> = {}
  try {
    const text = storage?.getItem(cacheKey)
    if (text) known = JSON.parse(text) as Record<string, number>
  } catch {
    known = {}
  }
  const missing = [...new Set(blocks.map((b) => b.toString()))].filter((b) => known[b] === undefined)
  if (missing.length === 0) return known

  const fetched = await mapLimit(missing, concurrency, (b) => withRetry(() => fetchTime(BigInt(b)), retry))
  const next = { ...known }
  missing.forEach((b, i) => {
    next[b] = fetched[i]
  })
  try {
    storage?.setItem(cacheKey, JSON.stringify(next))
  } catch {
    // Not remembered; fine.
  }
  return next
}
