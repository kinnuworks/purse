import { describe, expect, it } from 'vitest'
import { createLineParser, runDemo, type DemoEvent } from './demo-client'
import { parseMoney, formatMoney } from './format'
import { allocation, arrangePurses, canDeliver, canLock, canName, canRefund, canSweep, checkWinnerRows, deriveState, type PurseSnapshot } from './purse-state'

const base: PurseSnapshot = { named: false, locked: false, nameBy: 1000n, claimBy: 0n, pool: 5_000_000n, owed: 5_000_000n, winners: [] }
const named: PurseSnapshot = { ...base, locked: true, named: true, claimBy: 2000n, winners: [{ amount: 5_000_000n, delivered: false }] }

describe('purse state', () => {
  it('covers Open, Locked, Winners named, Paid out and Returned', () => {
    expect(deriveState(base, 500n)).toBe('Open')
    expect(deriveState({ ...base, locked: true }, 500n)).toBe('Locked')
    expect(deriveState(named, 1500n)).toBe('Winners named')
    expect(deriveState({ ...named, owed: 0n, winners: [{ amount: 5_000_000n, delivered: true }] }, 1500n)).toBe('Paid out')
    expect(deriveState({ ...named, owed: 0n }, 2500n)).toBe('Returned')
  })

  it('says Refunds open, then Returned, when nobody named winners in time', () => {
    expect(deriveState({ ...base, locked: true }, 1001n)).toBe('Refunds open')
    expect(deriveState({ ...base, owed: 0n }, 1001n)).toBe('Returned')
  })

  it('keeps the naming deadline inclusive', () => {
    expect(deriveState(base, 1000n)).toBe('Open')
    expect(canLock(base, 1000n)).toBe(true)
    expect(canLock(base, 1001n)).toBe(false)
  })
})

describe('what anyone may do', () => {
  it('lets winners be named only after the lock', () => {
    expect(canName(base, 500n)).toBe(false)
    expect(canName({ ...base, locked: true }, 500n)).toBe(true)
  })

  it('opens delivery until claimBy and sweeping from claimBy', () => {
    expect(canDeliver(named, 1999n, false)).toBe(true)
    expect(canDeliver(named, 2000n, false)).toBe(false)
    expect(canDeliver(named, 1500n, true)).toBe(false)
    expect(canSweep(named, 1999n)).toBe(false)
    expect(canSweep(named, 2000n)).toBe(true)
    expect(canSweep({ ...named, owed: 0n }, 2500n)).toBe(false)
  })

  it('opens refunds only after nameBy with no winners and money left', () => {
    expect(canRefund(base, 1000n, 10n)).toBe(false)
    expect(canRefund(base, 1001n, 10n)).toBe(true)
    expect(canRefund(base, 1001n, 0n)).toBe(false)
    expect(canRefund(named, 1001n, 10n)).toBe(false)
  })
})

describe('winner amounts against the pool', () => {
  it('reports short, over and matching totals', () => {
    expect(allocation([2n, 2n], 5n)).toMatchObject({ status: 'short', remaining: 1n })
    expect(allocation([3n, 3n], 5n)).toMatchObject({ status: 'over', remaining: -1n })
    expect(allocation([2n, 3n], 5n)).toMatchObject({ status: 'match', remaining: 0n })
  })

  const a = '0x00000000000000000000000000000000000000a1'
  const b = '0x00000000000000000000000000000000000000b2'

  it('accepts a list that adds up exactly', () => {
    const check = checkWinnerRows([{ address: a, amount: '3' }, { address: b, amount: '2' }], 5_000_000n, parseMoney, 50)
    expect(check.ok).toBe(true)
    expect(check.amounts).toEqual([3_000_000n, 2_000_000n])
  })

  it('explains every way a list can be wrong', () => {
    const problems = checkWinnerRows(
      [
        { address: a, amount: '3' },
        { address: a, amount: '0' },
        { address: 'nope', amount: '1' },
        { address: '0x0000000000000000000000000000000000000000', amount: '1' },
      ],
      9_000_000n,
      parseMoney,
      50,
    ).problems.join(' ')
    expect(problems).toContain('listed twice')
    expect(problems).toContain('above zero')
    expect(problems).toContain('full wallet address')
    expect(problems).toContain('zero address')
    expect(problems).toContain('add up to exactly the pool')
  })

  it('refuses an empty list and too many winners', () => {
    expect(checkWinnerRows([], 1n, parseMoney, 50).ok).toBe(false)
    const rows = Array.from({ length: 3 }, (_, i) => ({ address: `0x${(i + 1).toString(16).padStart(40, '0')}`, amount: '1' }))
    expect(checkWinnerRows(rows, 3_000_000n, parseMoney, 2).problems.join(' ')).toContain('at most 2')
  })
})

describe('home ordering', () => {
  const p = (id: number, title: string) => ({ id: BigInt(id), title })

  it('features the newest purse that is not a demo run', () => {
    const { featured, real, demos } = arrangePurses([p(0, 'Spring hackathon'), p(1, 'Demo purse'), p(2, 'Grant round'), p(3, 'Demo purse')])
    expect(featured?.id).toBe(2n)
    expect(real.map((x) => x.id)).toEqual([2n, 0n])
    expect(demos.map((x) => x.id)).toEqual([3n, 1n])
  })

  it('falls back to the newest demo when there is no other purse', () => {
    expect(arrangePurses([p(0, 'Demo purse'), p(1, 'Demo purse')]).featured?.id).toBe(1n)
  })

  it('has nothing to feature when there are no purses, and ignores the order it was given', () => {
    expect(arrangePurses([]).featured).toBeUndefined()
    expect(arrangePurses([p(5, 'B'), p(9, 'A')]).real.map((x) => x.id)).toEqual([9n, 5n])
  })

  it('only treats the exact demo title as a demo run', () => {
    expect(arrangePurses([p(1, 'Demo purse 2'), p(0, 'demo purse')]).demos).toEqual([])
  })
})

describe('money text', () => {
  it('shows two decimals and never rounds', () => {
    expect(formatMoney(10_000n)).toBe('0.01')
    expect(formatMoney(1_250_000_000n)).toBe('1,250.00')
    expect(formatMoney(1_234_567n)).toBe('1.234567')
  })

  it('reads what people type', () => {
    expect(parseMoney('12.50')).toBe(12_500_000n)
    expect(parseMoney('1,000')).toBe(1_000_000_000n)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('1.1234567')).toBeNull()
  })
})

describe('demo stream reader', () => {
  it('rebuilds events split across chunks and skips broken lines', () => {
    const seen: DemoEvent[] = []
    const parser = createLineParser((e) => seen.push(e))
    parser.push('{"type":"step","step":"create","status":"pen')
    parser.push('ding"}\nnot json\n{"type":"done","id":"4","winner":"0x1"}')
    parser.end()
    expect(seen).toEqual([
      { type: 'step', step: 'create', status: 'pending' },
      { type: 'done', id: '4', winner: '0x1' },
    ])
  })

  it('treats a missing function (HTML answer) as unavailable', async () => {
    const html = () => Promise.resolve(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    expect(await runDemo('', () => undefined, html as typeof fetch)).toEqual({ kind: 'unavailable' })
    const down = () => Promise.reject(new Error('offline'))
    expect(await runDemo('', () => undefined, down as typeof fetch)).toEqual({ kind: 'unavailable' })
  })

  it('shows a limit message instead of treating it as unavailable', async () => {
    const seen: DemoEvent[] = []
    const limited = () =>
      Promise.resolve(new Response(JSON.stringify({ type: 'error', code: 'too_soon', message: 'Wait.' }), { status: 429, headers: { 'content-type': 'application/json' } }))
    expect(await runDemo('', (e) => seen.push(e), limited as typeof fetch)).toEqual({ kind: 'stopped' })
    expect(seen[0]).toMatchObject({ message: 'Wait.' })
  })
})
