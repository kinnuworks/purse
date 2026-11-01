import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult } from 'viem'
import { describe, expect, it } from 'vitest'
import { STRANGER, classifySimulation, planAttacks } from './attacks'
import type { PurseData } from './data'
import { plainRevert, revertInfo } from './errors'
import type { PurseEvent } from './events'
import { purseAbi } from './purse-abi'
import { computeStats, pickExamples } from './stats'

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as const
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const
const ORG = addr(0xa1)
const OTHER = addr(0xb2)
const NOW = 1_000n

function purse(over: Partial<PurseData> & { id: bigint; title: string }): PurseData {
  return {
    organiser: ORG,
    claimWindow: 100n,
    nameBy: 2_000n,
    claimBy: 0n,
    named: false,
    locked: false,
    pool: 1_000_000n,
    owed: 1_000_000n,
    winnerCount: 0n,
    winners: [],
    ...over,
  }
}

const named = (over: Partial<PurseData> & { id: bigint; title: string }) =>
  purse({ named: true, locked: true, claimBy: 5_000n, winnerCount: 1n, winners: [{ winner: OTHER, amount: 1_000_000n, delivered: false }], ...over })

describe('attack planning from live purses', () => {
  // Shaped like the live contract: an open real purse, named test purses inside their claim window, an old refunded one.
  const live = [
    named({ id: 0n, title: 'Demo purse', owed: 0n, winners: [{ winner: OTHER, amount: 10_000n, delivered: true }] }),
    purse({ id: 1n, title: 'Launch prize' }),
    purse({ id: 2n, title: 'Test: nobody named', nameBy: 500n, pool: 0n, owed: 0n }),
    named({ id: 4n, title: 'Test: ten winners', owed: 0n, winners: [{ winner: OTHER, amount: 10_000n, delivered: true }] }),
  ]
  const plans = planAttacks(live, NOW)
  const by = (key: string) => plans.find((p) => p.key === key)!

  it('lists all eight attacks', () => {
    expect(plans.map((p) => p.key)).toEqual(['take-back', 'name-twice', 'short-pool', 'stranger-names', 'paid-twice', 'redirect', 'refund-after-named', 'early-sweep'])
  })

  it('uses an open real purse where one fits, and says so when it is not locked', () => {
    expect(by('take-back').target?.purseId).toBe(1n)
    expect(by('take-back').note).toContain('No purse is locked')
    expect(by('stranger-names').target?.purseId).toBe(1n)
    expect(by('stranger-names').target?.caller).toBe(STRANGER)
  })

  it('says so instead of faking when nothing fits', () => {
    expect(by('short-pool').target).toBeNull()
    expect(by('short-pool').unavailable).toContain('not faked')
  })

  it('picks a delivered prize inside its claim window for the double payment', () => {
    const t = by('paid-twice').target!
    expect(t.purseId).toBe(4n)
    expect(t.caller).toBe(STRANGER)
  })

  it('simulates from the right caller', () => {
    expect(by('name-twice').target?.caller).toBe(ORG)
    expect(by('early-sweep').target?.caller).toBe(ORG)
    expect(by('refund-after-named').target?.caller).toBe(ORG)
    expect(by('redirect').target?.caller).toBe(STRANGER)
  })

  it('finds no sweep or delivery target once every claim window has closed', () => {
    const closed = planAttacks([named({ id: 0n, title: 'Old', claimBy: 900n })], NOW)
    expect(closed.find((p) => p.key === 'early-sweep')?.target).toBeNull()
    expect(closed.find((p) => p.key === 'paid-twice')?.target).toBeNull()
    expect(closed.find((p) => p.key === 'name-twice')?.target?.purseId).toBe(0n)
  })

  it('handles a chain with no purses', () => {
    expect(planAttacks([], NOW).every((p) => p.target === null)).toBe(true)
  })

  it('uses a locked purse for the short pool and takes back attacks when there is one', () => {
    const withLocked = planAttacks([purse({ id: 7n, title: 'Locked one', locked: true, pool: 5_000_000n })], NOW)
    expect(withLocked.find((p) => p.key === 'short-pool')?.target?.purseId).toBe(7n)
    expect(withLocked.find((p) => p.key === 'take-back')?.note).toBeUndefined()
  })

  it('prefers a real purse over a test purse for the same attack', () => {
    const mixed = planAttacks([purse({ id: 1n, title: 'Real' }), purse({ id: 9n, title: 'Test: newer' })], NOW)
    expect(mixed.find((p) => p.key === 'stranger-names')?.target?.purseId).toBe(1n)
  })
})

describe('simulation results', () => {
  it('shows a refusal with the contract’s reason and checks it is the expected one', () => {
    const r = classifySimulation({ ok: false, revert: { name: 'AlreadyNamed', text: 'AlreadyNamed()' }, message: '' }, 'AlreadyNamed')
    expect(r).toEqual({ outcome: 'blocked', reason: 'AlreadyNamed()', name: 'AlreadyNamed', matchesExpected: true })
    expect(classifySimulation({ ok: false, revert: { name: 'NotLocked', text: 'NotLocked(1)' }, message: '' }, 'AlreadyNamed')).toMatchObject({ matchesExpected: false })
  })

  it('reports a call that goes through as a failure', () => {
    expect(classifySimulation({ ok: true }, 'AlreadyNamed')).toEqual({ outcome: 'succeeded' })
  })

  it('keeps a network problem separate from a refusal', () => {
    expect(classifySimulation({ ok: false, revert: null, message: 'offline' }, 'x')).toEqual({ outcome: 'error', message: 'offline' })
  })

  it('reads the real revert reason out of a viem error', () => {
    const data = encodeErrorResult({ abi: purseAbi, errorName: 'NotOrganiser', args: [STRANGER, ORG] })
    const revert = new ContractFunctionRevertedError({ abi: purseAbi, data, functionName: 'name' })
    const wrapped = new ContractFunctionExecutionError(revert, { abi: purseAbi, functionName: 'name', args: [1n, [], []] })
    const info = revertInfo(wrapped)
    expect(info?.name).toBe('NotOrganiser')
    expect(info?.text.toLowerCase()).toBe(`NotOrganiser(${STRANGER}, ${ORG})`.toLowerCase())
    expect(plainRevert('NotOrganiser')).toContain('organiser')
  })

  it('returns null for an error that is not one of the contract’s', () => {
    expect(revertInfo(new Error('network down'))).toBeNull()
  })
})

describe('live totals', () => {
  const meta = (n: number) => ({ blockNumber: BigInt(n), txHash: hash(n), logIndex: 0 })
  const A = addr(0xa1)
  const B = addr(0xb2)
  const C = addr(0xc3)
  const D = addr(0xd4)
  const events: PurseEvent[] = [
    { ...meta(1), name: 'PurseCreated', id: 0n, organiser: A, title: 'Real prize', amount: 5n, nameBy: 9n, claimWindow: 60n },
    { ...meta(2), name: 'Funded', id: 0n, funder: A, amount: 5n, newPool: 5n },
    { ...meta(3), name: 'Funded', id: 0n, funder: B, amount: 2n, newPool: 7n },
    { ...meta(4), name: 'WinnersNamed', id: 0n, winners: [C, D], amounts: [4n, 3n], claimBy: 99n },
    { ...meta(5), name: 'Delivered', id: 0n, winner: C, amount: 4n, caller: A },
    { ...meta(6), name: 'PurseCreated', id: 1n, organiser: B, title: 'Test: refund', amount: 3n, nameBy: 9n, claimWindow: 60n },
    { ...meta(7), name: 'Refunded', id: 1n, funder: B, amount: 3n },
    { ...meta(8), name: 'PurseCreated', id: 2n, organiser: A, title: 'Test: unclaimed', amount: 2n, nameBy: 9n, claimWindow: 60n },
    { ...meta(9), name: 'Swept', id: 2n, organiser: A, amount: 2n, caller: D },
  ]

  it('adds up delivered, refunded and returned money from the events', () => {
    const s = computeStats(events, [3n, 0n, 0n], [])
    expect(s).toMatchObject({ purses: 3, lockedNow: 3n, delivered: 4n, refunded: 3n, returned: 2n })
  })

  it('counts each wallet once and splits ours from others, ignoring case', () => {
    const s = computeStats(events, [], [A.toUpperCase().replace('0X', '0x'), C])
    expect(s.wallets).toEqual({ total: 4, ours: 2, others: 2 })
  })

  it('shows everything as others when no addresses are listed', () => {
    expect(computeStats(events, [], []).wallets).toEqual({ total: 4, ours: 0, others: 4 })
  })

  it('handles an empty chain', () => {
    expect(computeStats([], [], [])).toMatchObject({ purses: 0, lockedNow: 0n, wallets: { total: 0, ours: 0, others: 0 } })
  })

  it('finds one real example for each way money leaves, newest first, preferring real purses', () => {
    const ex = pickExamples(events)
    expect(ex.delivered).toMatchObject({ purseId: 0n, amount: 4n, to: C, title: 'Real prize' })
    expect(ex.refunded).toMatchObject({ purseId: 1n, amount: 3n, to: B })
    expect(ex.returned).toMatchObject({ purseId: 2n, amount: 2n, to: A })
  })

  it('reports no example for a kind that has never happened', () => {
    expect(pickExamples(events.slice(0, 5)).refunded).toBeNull()
  })
})
