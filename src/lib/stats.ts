import type { PurseEvent } from './events'
import { isTestOrDemo } from './purse-state'

/**
 * Totals worked out from the contract's own event log and purse reads.
 * Nothing here is typed in: every figure comes from chain data passed in.
 */

export interface Stats {
  purses: number
  /** USDC the contract still holds for purses that have not finished paying out (sum of each purse's owed amount). */
  lockedNow: bigint
  delivered: bigint
  refunded: bigint
  /** Prize money returned to the organiser because nobody claimed it in time. */
  returned: bigint
  wallets: { total: number; ours: number; others: number }
}

export function computeStats(events: readonly PurseEvent[], owedByPurse: readonly bigint[], ourAddresses: readonly string[]): Stats {
  let delivered = 0n
  let refunded = 0n
  let returned = 0n
  let purses = 0
  const seen = new Set<string>()
  const add = (a: string) => seen.add(a.toLowerCase())

  for (const e of events) {
    switch (e.name) {
      case 'PurseCreated':
        purses++
        add(e.organiser)
        break
      case 'Funded':
        add(e.funder)
        break
      case 'WinnersNamed':
        e.winners.forEach(add)
        break
      case 'Delivered':
        delivered += e.amount
        add(e.winner)
        add(e.caller)
        break
      case 'Refunded':
        refunded += e.amount
        add(e.funder)
        break
      case 'Swept':
        returned += e.amount
        add(e.organiser)
        add(e.caller)
        break
      case 'FundingLocked':
        break
    }
  }

  const ours = new Set(ourAddresses.map((a) => a.toLowerCase()))
  let oursCount = 0
  for (const a of seen) if (ours.has(a)) oursCount++

  return {
    purses,
    lockedNow: owedByPurse.reduce((sum, v) => sum + v, 0n),
    delivered,
    refunded,
    returned,
    wallets: { total: seen.size, ours: oursCount, others: seen.size - oursCount },
  }
}

export type MoneyOut = 'delivered' | 'refunded' | 'returned'

export interface Example {
  kind: MoneyOut
  purseId: bigint
  title: string
  amount: bigint
  txHash: `0x${string}`
  /** The wallet that received the money. */
  to: `0x${string}`
}

/**
 * One real example for each way money leaves the contract: the newest event of that kind,
 * preferring a purse that is not a test or demo run. Returns null for a kind that has never happened.
 */
export function pickExamples(events: readonly PurseEvent[]): Record<MoneyOut, Example | null> {
  const titles = new Map<bigint, string>()
  for (const e of events) if (e.name === 'PurseCreated') titles.set(e.id, e.title)

  const toExample = (e: PurseEvent): Example | null => {
    const title = titles.get(e.id) ?? `Purse ${e.id}`
    if (e.name === 'Delivered') return { kind: 'delivered', purseId: e.id, title, amount: e.amount, txHash: e.txHash, to: e.winner }
    if (e.name === 'Refunded') return { kind: 'refunded', purseId: e.id, title, amount: e.amount, txHash: e.txHash, to: e.funder }
    if (e.name === 'Swept') return { kind: 'returned', purseId: e.id, title, amount: e.amount, txHash: e.txHash, to: e.organiser }
    return null
  }
  const newest = (kind: MoneyOut): Example | null => {
    const all = events
      .map(toExample)
      .filter((x): x is Example => x !== null && x.kind === kind)
      .reverse()
    return all.find((x) => !isTestOrDemo(x.title)) ?? all[0] ?? null
  }
  return { delivered: newest('delivered'), refunded: newest('refunded'), returned: newest('returned') }
}
