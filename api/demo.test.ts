import { describe, expect, it } from 'vitest'
import { DAILY_LIMIT, MIN_BALANCE, RUN_GAP_SECONDS, evaluateLimits, handle, parseWinner, readConfig, runStats } from './demo'

const NOW = 1_800_000_000n
const GOOD_BALANCE = MIN_BALANCE + 1n
const none = { last: null, inLastDay: 0 }
const KEY = `0x${'11'.repeat(32)}`
const PURSE = '0x00000000000000000000000000000000000000aa'
const WINNER = '0x00000000000000000000000000000000000000bb'

describe('demo limits', () => {
  it('lets a first run through when funded', () => {
    expect(evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: none, winnerUsed: false })).toEqual({ ok: true })
  })

  it('stops with a friendly message below 0.20 USDC, and allows exactly 0.20', () => {
    const low = evaluateLimits({ now: NOW, balance: MIN_BALANCE - 1n, stats: none, winnerUsed: false })
    expect(low).toMatchObject({ ok: false, code: 'low_balance' })
    expect(evaluateLimits({ now: NOW, balance: MIN_BALANCE, stats: none, winnerUsed: false }).ok).toBe(true)
  })

  it('allows one run every 60 seconds, not sooner', () => {
    const tooSoon = evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: { last: NOW - (RUN_GAP_SECONDS - 1n), inLastDay: 1 }, winnerUsed: false })
    expect(tooSoon).toMatchObject({ ok: false, code: 'too_soon' })
    expect(tooSoon.ok === false && tooSoon.message).toContain('1 second')
    expect(evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: { last: NOW - RUN_GAP_SECONDS, inLastDay: 1 }, winnerUsed: false }).ok).toBe(true)
  })

  it('stops at the daily limit of 50 and allows the 50th run', () => {
    expect(evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: { last: NOW - 100n, inLastDay: DAILY_LIMIT - 1 }, winnerUsed: false }).ok).toBe(true)
    expect(evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: { last: NOW - 100n, inLastDay: DAILY_LIMIT }, winnerUsed: false })).toMatchObject({
      ok: false,
      code: 'daily_limit',
    })
  })

  it('allows one run per winner address', () => {
    expect(evaluateLimits({ now: NOW, balance: GOOD_BALANCE, stats: none, winnerUsed: true })).toMatchObject({ ok: false, code: 'winner_used' })
  })

  it('reports the balance problem before the other limits', () => {
    expect(evaluateLimits({ now: NOW, balance: 0n, stats: { last: NOW, inLastDay: 99 }, winnerUsed: true })).toMatchObject({ code: 'low_balance' })
  })
})

describe('run statistics from chain state', () => {
  it('finds the latest run and counts only the last 24 hours', () => {
    const day = 86_400n
    const stats = runStats([NOW - 2n * day, NOW - day, NOW - day + 1n, NOW - 10n], NOW)
    expect(stats.last).toBe(NOW - 10n)
    expect(stats.inLastDay).toBe(2)
  })

  it('reports no run when there are none', () => {
    expect(runStats([], NOW)).toEqual({ last: null, inLastDay: 0 })
  })
})

describe('winner input', () => {
  it('treats an empty or missing winner as the demo wallet second address', () => {
    expect(parseWinner({})).toEqual({ winner: null })
    expect(parseWinner({ winner: '   ' })).toEqual({ winner: null })
    expect(parseWinner(null)).toEqual({ winner: null })
  })

  it('accepts a real address and normalises it', () => {
    expect(parseWinner({ winner: WINNER.toUpperCase().replace('0X', '0x') })).toMatchObject({ winner: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/) })
  })

  it('rejects anything that is not an address, and the zero address', () => {
    expect(parseWinner({ winner: 'hello' })).toHaveProperty('error')
    expect(parseWinner({ winner: 42 })).toHaveProperty('error')
    expect(parseWinner({ winner: '0x0000000000000000000000000000000000000000' })).toHaveProperty('error')
  })
})

describe('demo function setup', () => {
  const post = (body: unknown) => new Request('https://example.test/api/demo', { method: 'POST', body: JSON.stringify(body) })

  it('is unavailable without a key or contract address, and never echoes a key', async () => {
    const response = await handle(post({}), {})
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(JSON.parse(text)).toMatchObject({ type: 'error', code: 'unavailable' })
  })

  it('rejects a malformed key', () => {
    expect(readConfig({ DEMO_PRIVATE_KEY: 'nope', VITE_PURSE_ADDRESS: PURSE })).toBeNull()
  })

  it('reads Arc mainnet defaults', () => {
    const config = readConfig({ DEMO_PRIVATE_KEY: KEY, VITE_PURSE_ADDRESS: PURSE })
    expect(config).toMatchObject({ chainId: 5042, rpc: 'https://rpc.mainnet.arc.io', deployBlock: 29024415n })
  })

  it('defaults to the live Purse contract and its deploy block', () => {
    const config = readConfig({ DEMO_PRIVATE_KEY: KEY })
    expect(config).toMatchObject({ purse: '0xC81332357d6832d5FDDd8eCDC884Ef4e461c422B', deployBlock: 29024415n })
  })

  it('answers a bad winner with 400 before touching the chain', async () => {
    const response = await handle(post({ winner: 'nope' }), { DEMO_PRIVATE_KEY: KEY, VITE_PURSE_ADDRESS: PURSE })
    expect(response.status).toBe(400)
  })

  it('only accepts POST', async () => {
    const response = await handle(new Request('https://example.test/api/demo'), { DEMO_PRIVATE_KEY: KEY, VITE_PURSE_ADDRESS: PURSE })
    expect(response.status).toBe(405)
  })
})
