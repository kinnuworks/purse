import { useSyncExternalStore } from 'react'
import { publicClient } from './chain'
import { CHAIN_ID, DEPLOY_BLOCK, LOG_RANGE, PURSE_ADDRESS } from './env'
import { decodePurseLog, type PurseEvent } from './events'
import { readCachedHistory, readHistory } from './logs'
import { plainError } from './errors'

/**
 * One shared reader for the Purse event history. It starts when the first page asks for it,
 * shows whatever localStorage already holds right away, then reads only the new blocks.
 */

export interface HistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  events: PurseEvent[]
  /** How far the scan has got, for the loading line. */
  progress: { scannedTo: bigint; head: bigint } | null
  error: string | null
}

const cacheKey = `purse:history:v1:${CHAIN_ID}:${PURSE_ADDRESS ?? 'none'}:${DEPLOY_BLOCK}`

const storage = typeof window !== 'undefined' ? window.localStorage : null

let state: HistoryState = { status: 'idle', events: [], progress: null, error: null }
const listeners = new Set<() => void>()
let started = false
let running = false

function set(next: Partial<HistoryState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export async function refreshHistory(): Promise<void> {
  if (running || !PURSE_ADDRESS) return
  const address = PURSE_ADDRESS
  running = true
  try {
    if (state.status !== 'ready') set({ status: 'loading', error: null })
    const result = await readHistory({
      deployBlock: DEPLOY_BLOCK,
      range: LOG_RANGE,
      storage,
      cacheKey,
      getHead: () => publicClient.getBlockNumber(),
      fetchRange: async (from, to) => {
        const logs = await publicClient.getLogs({ address, fromBlock: from, toBlock: to })
        return logs.map(decodePurseLog).filter((e): e is PurseEvent => e !== null)
      },
      onProgress: (progress) => set({ progress }),
    })
    set({ status: 'ready', events: result.events, progress: null, error: null })
  } catch (error) {
    set({ status: 'error', error: plainError(error), progress: null })
  } finally {
    running = false
  }
}

function start() {
  if (started || !PURSE_ADDRESS) return
  started = true
  const cached = readCachedHistory(storage, cacheKey)
  if (cached) set({ events: cached.events })
  void refreshHistory()
  setInterval(() => void refreshHistory(), 20_000)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  start()
  return () => listeners.delete(listener)
}

export const useHistory = () => useSyncExternalStore(subscribe, () => state)

export const eventsForPurse = (events: PurseEvent[], id: bigint) => events.filter((e) => e.id === id)
