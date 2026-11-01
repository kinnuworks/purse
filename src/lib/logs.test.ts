import { describe, expect, it } from 'vitest'
import { deserializeEvents, serializeEvents, type PurseEvent } from './events'
import { readBlockTimes, readCachedHistory, readHistory, type KeyValueStore } from './logs'
import { isRangeTooLarge, isRateLimited, withRetry } from './retry'

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const
const who = '0x00000000000000000000000000000000000000aa' as const

function funded(block: number, logIndex = 0): PurseEvent {
  return { name: 'Funded', id: 1n, funder: who, amount: BigInt(block), newPool: BigInt(block), blockNumber: BigInt(block), txHash: hash(block), logIndex }
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const tooMany = () => Object.assign(new Error('HTTP request failed.'), { status: 429 })
const noWait = { sleep: () => Promise.resolve(), random: () => 0 }

/** A fake chain: events live at fixed blocks and a range query returns the ones inside it. */
function fakeChain(blocks: number[], opts: { maxSpan?: number } = {}) {
  const calls: Array<[bigint, bigint]> = []
  return {
    calls,
    fetchRange: (from: bigint, to: bigint) => {
      calls.push([from, to])
      if (opts.maxSpan && Number(to - from) + 1 > opts.maxSpan) return Promise.reject(new Error('query exceeds max block range'))
      return Promise.resolve(blocks.filter((b) => BigInt(b) >= from && BigInt(b) <= to).map((b) => funded(b)))
    },
  }
}

describe('error classification', () => {
  it('recognises 429 by status, by nested cause and by text', () => {
    expect(isRateLimited(tooMany())).toBe(true)
    expect(isRateLimited(Object.assign(new Error('wrapper'), { cause: tooMany() }))).toBe(true)
    expect(isRateLimited(new Error('Too Many Requests'))).toBe(true)
    expect(isRateLimited(new Error('execution reverted'))).toBe(false)
  })

  it('treats a range complaint as a range error but never a 429', () => {
    expect(isRangeTooLarge(new Error('eth_getLogs block range too large'))).toBe(true)
    expect(isRangeTooLarge(tooMany())).toBe(false)
  })
})

describe('withRetry', () => {
  it('retries a 429 with growing waits and then succeeds', async () => {
    const delays: number[] = []
    let attempts = 0
    const result = await withRetry(
      () => {
        attempts++
        return attempts < 4 ? Promise.reject(tooMany()) : Promise.resolve('ok')
      },
      { sleep: (ms) => Promise.resolve(void delays.push(ms)), random: () => 0, baseMs: 100 },
    )
    expect(result).toBe('ok')
    expect(delays).toEqual([100, 200, 400])
  })

  it('does not retry other errors', async () => {
    let attempts = 0
    await expect(
      withRetry(() => {
        attempts++
        return Promise.reject(new Error('boom'))
      }, noWait),
    ).rejects.toThrow('boom')
    expect(attempts).toBe(1)
  })

  it('gives up after the retry limit', async () => {
    let attempts = 0
    await expect(
      withRetry(
        () => {
          attempts++
          return Promise.reject(tooMany())
        },
        { ...noWait, retries: 2 },
      ),
    ).rejects.toMatchObject({ status: 429 })
    expect(attempts).toBe(3)
  })

  it('honours a Retry-After header when it is longer than the backoff', async () => {
    const delays: number[] = []
    let attempts = 0
    await withRetry(
      () => {
        attempts++
        if (attempts === 1) return Promise.reject(Object.assign(tooMany(), { headers: { get: () => '3' } }))
        return Promise.resolve(1)
      },
      { sleep: (ms) => Promise.resolve(void delays.push(ms)), random: () => 0, baseMs: 100 },
    )
    expect(delays).toEqual([3000])
  })
})

describe('readHistory', () => {
  it('reads from the deploy block to the head in small windows, in order', async () => {
    const chain = fakeChain([100, 103, 105])
    const result = await readHistory({
      fetchRange: chain.fetchRange,
      getHead: () => Promise.resolve(105n),
      deployBlock: 100n,
      range: 2n,
      cacheKey: 'k',
      concurrency: 1,
    })
    expect(chain.calls).toEqual([
      [100n, 101n],
      [102n, 103n],
      [104n, 105n],
    ])
    expect(result.events.map((e) => e.blockNumber)).toEqual([100n, 103n, 105n])
    expect(result.scannedTo).toBe(105n)
  })

  it('never asks for blocks before the deploy block', async () => {
    const chain = fakeChain([])
    await readHistory({ fetchRange: chain.fetchRange, getHead: () => Promise.resolve(20n), deployBlock: 15n, range: 100n, cacheKey: 'k' })
    expect(chain.calls).toEqual([[15n, 20n]])
  })

  it('retries a 429 on a window and still returns every event', async () => {
    const chain = fakeChain([10, 11])
    let failures = 2
    const result = await readHistory({
      fetchRange: (from, to) => (failures-- > 0 ? Promise.reject(tooMany()) : chain.fetchRange(from, to)),
      getHead: () => Promise.resolve(11n),
      deployBlock: 10n,
      range: 10n,
      cacheKey: 'k',
      retry: noWait,
    })
    expect(result.events).toHaveLength(2)
  })

  it('splits a window the node refuses as too large', async () => {
    const chain = fakeChain([1, 4, 8], { maxSpan: 2 })
    const result = await readHistory({
      fetchRange: chain.fetchRange,
      getHead: () => Promise.resolve(8n),
      deployBlock: 1n,
      range: 8n,
      cacheKey: 'k',
      retry: noWait,
    })
    expect(result.events.map((e) => e.blockNumber)).toEqual([1n, 4n, 8n])
  })

  it('remembers what it read and next time only reads the new blocks', async () => {
    const storage = memoryStore()
    const first = fakeChain([100, 101])
    await readHistory({ fetchRange: first.fetchRange, getHead: () => Promise.resolve(102n), deployBlock: 100n, range: 50n, cacheKey: 'k', storage })

    const second = fakeChain([100, 101, 105])
    const result = await readHistory({ fetchRange: second.fetchRange, getHead: () => Promise.resolve(106n), deployBlock: 100n, range: 50n, cacheKey: 'k', storage })
    expect(second.calls).toEqual([[103n, 106n]])
    expect(result.events.map((e) => e.blockNumber)).toEqual([100n, 101n, 105n])
    expect(readCachedHistory(storage, 'k')?.scannedTo).toBe(106n)
  })

  it('keeps progress when a later window fails, and resumes from there', async () => {
    const storage = memoryStore()
    const chain = fakeChain([10, 30])
    await expect(
      readHistory({
        fetchRange: (from, to) => (from >= 20n ? Promise.reject(new Error('node down')) : chain.fetchRange(from, to)),
        getHead: () => Promise.resolve(39n),
        deployBlock: 10n,
        range: 10n,
        cacheKey: 'k',
        storage,
        concurrency: 1,
        retry: noWait,
      }),
    ).rejects.toThrow('node down')
    expect(readCachedHistory(storage, 'k')?.scannedTo).toBe(19n)

    const resumed = fakeChain([10, 30])
    const result = await readHistory({ fetchRange: resumed.fetchRange, getHead: () => Promise.resolve(39n), deployBlock: 10n, range: 10n, cacheKey: 'k', storage, concurrency: 1 })
    expect(resumed.calls[0]).toEqual([20n, 29n])
    expect(result.events.map((e) => e.blockNumber)).toEqual([10n, 30n])
  })

  it('ignores a damaged cache and reads from the deploy block', async () => {
    const storage = memoryStore()
    storage.setItem('k', '{not json')
    const chain = fakeChain([5])
    const result = await readHistory({ fetchRange: chain.fetchRange, getHead: () => Promise.resolve(6n), deployBlock: 5n, range: 10n, cacheKey: 'k', storage })
    expect(chain.calls).toEqual([[5n, 6n]])
    expect(result.events).toHaveLength(1)
  })

  it('counts an event once even if two windows return it', async () => {
    const result = await readHistory({
      fetchRange: () => Promise.resolve([funded(7)]),
      getHead: () => Promise.resolve(9n),
      deployBlock: 5n,
      range: 2n,
      cacheKey: 'k',
    })
    expect(result.events).toHaveLength(1)
  })

  it('survives a storage that refuses writes', async () => {
    const storage: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const chain = fakeChain([1])
    const result = await readHistory({ fetchRange: chain.fetchRange, getHead: () => Promise.resolve(2n), deployBlock: 1n, range: 5n, cacheKey: 'k', storage })
    expect(result.events).toHaveLength(1)
  })
})

describe('event cache format', () => {
  it('round-trips bigints and addresses', () => {
    const events: PurseEvent[] = [
      funded(3),
      { name: 'WinnersNamed', id: 2n, winners: [who], amounts: [5n], claimBy: 99n, blockNumber: 4n, txHash: hash(4), logIndex: 1 },
    ]
    expect(deserializeEvents(serializeEvents(events))).toEqual(events)
  })
})

describe('readBlockTimes', () => {
  it('fetches each block once and remembers it', async () => {
    const storage = memoryStore()
    const asked: bigint[] = []
    const fetchTime = (b: bigint) => {
      asked.push(b)
      return Promise.resolve(Number(b) * 10)
    }
    const first = await readBlockTimes({ blocks: [5n, 6n, 5n], fetchTime, storage, cacheKey: 't' })
    expect(first).toEqual({ '5': 50, '6': 60 })
    const second = await readBlockTimes({ blocks: [5n, 7n], fetchTime, storage, cacheKey: 't' })
    expect(second['7']).toBe(70)
    expect(asked.sort()).toEqual([5n, 6n, 7n])
  })
})
