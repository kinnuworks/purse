/** Pure rules for what a purse is doing and what anyone may do next. All inputs come from chain reads. */

export type PurseState = 'Open' | 'Locked' | 'Winners named' | 'Paid out' | 'Returned' | 'Refunds open'

export interface PurseSnapshot {
  named: boolean
  locked: boolean
  nameBy: bigint
  claimBy: bigint
  pool: bigint
  owed: bigint
  /** Empty until winners are named. */
  winners: Array<{ amount: bigint; delivered: boolean }>
}

export function deriveState(s: PurseSnapshot, now: bigint): PurseState {
  if (!s.named) {
    if (now <= s.nameBy) return s.locked ? 'Locked' : 'Open'
    // The naming deadline passed with nobody named: every funder can take their own money back.
    return s.owed === 0n ? 'Returned' : 'Refunds open'
  }
  if (s.owed > 0n) return 'Winners named'
  return s.winners.length > 0 && s.winners.every((w) => w.delivered) ? 'Paid out' : 'Returned'
}

/** Title the demo function gives every purse it runs. */
export const DEMO_TITLE = 'Demo purse'

/** Purses made to try the flow: titles starting "Test:" or "Bounty:", and the demo function's runs. */
export const isTestOrDemo = (title: string) => title.startsWith('Test:') || title.startsWith('Bounty:') || title === DEMO_TITLE

/**
 * Splits purses (any order) into real ones and test/demo runs, each newest first by id.
 * The featured purse is, in order: the largest real purse that is open or being paid (Open, Locked,
 * Winners named or Paid out; the biggest pool wins, the newest on a tie), else the newest real purse,
 * else the newest test, bounty or demo run.
 */
export function arrangePurses<T extends PurseSnapshot & { id: bigint; title: string }>(
  purses: T[],
  now: bigint,
): { featured: T | undefined; real: T[]; testAndDemo: T[] } {
  const newestFirst = (a: T, b: T) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1)
  const real = purses.filter((p) => !isTestOrDemo(p.title)).sort(newestFirst)
  const testAndDemo = purses.filter((p) => isTestOrDemo(p.title)).sort(newestFirst)
  const eligible = real.filter((p) => {
    const state = deriveState(p, now)
    return state === 'Open' || state === 'Locked' || state === 'Winners named' || state === 'Paid out'
  })
  // `real` is newest first, so on equal pools the first one seen (the newest) is kept.
  const largest = eligible.reduce<T | undefined>((best, p) => (best === undefined || p.pool > best.pool ? p : best), undefined)
  return { featured: largest ?? real[0] ?? testAndDemo[0], real, testAndDemo }
}

/** The most money a purse ever held: everything put in, from its Funded events. */
export function peakFunded(events: ReadonlyArray<{ name: string; id: bigint; amount?: bigint }>, id: bigint): bigint {
  return events.reduce((sum, e) => (e.name === 'Funded' && e.id === id && e.amount !== undefined ? sum + e.amount : sum), 0n)
}

export type Held = { kind: 'amount'; raw: bigint; returned: boolean } | { kind: 'loading' }

/**
 * What to show as a purse's amount. The pool falls to zero once every funder has been refunded,
 * so a purse with an empty pool shows what it held, marked returned. Until the events are read there is nothing to show yet.
 */
export function heldAmount(pool: bigint, events: ReadonlyArray<{ name: string; id: bigint; amount?: bigint }>, id: bigint, eventsReady: boolean): Held {
  if (pool > 0n) return { kind: 'amount', raw: pool, returned: false }
  const peak = peakFunded(events, id)
  if (peak > 0n) return { kind: 'amount', raw: peak, returned: true }
  return eventsReady ? { kind: 'amount', raw: 0n, returned: false } : { kind: 'loading' }
}

export const canAdd = (s: PurseSnapshot, now: bigint) => !s.named && !s.locked && now <= s.nameBy
export const canLock = (s: PurseSnapshot, now: bigint) => !s.named && !s.locked && now <= s.nameBy
export const canName = (s: PurseSnapshot, now: bigint) => !s.named && s.locked && now <= s.nameBy
export const canDeliver = (s: PurseSnapshot, now: bigint, delivered: boolean) => s.named && !delivered && now < s.claimBy
export const canRefund = (s: PurseSnapshot, now: bigint, contribution: bigint) => !s.named && now > s.nameBy && contribution > 0n
export const canSweep = (s: PurseSnapshot, now: bigint) => s.named && now >= s.claimBy && s.owed > 0n

export interface Allocation {
  total: bigint
  pool: bigint
  /** pool minus total. Positive means money is still unassigned. */
  remaining: bigint
  status: 'match' | 'short' | 'over'
}

export function allocation(amounts: bigint[], pool: bigint): Allocation {
  const total = amounts.reduce((sum, a) => sum + a, 0n)
  const remaining = pool - total
  return { total, pool, remaining, status: remaining === 0n ? 'match' : remaining > 0n ? 'short' : 'over' }
}

export interface WinnerRowInput {
  address: string
  amount: string
}

export interface WinnerCheck {
  ok: boolean
  /** Plain-words reasons the list cannot be submitted yet. Empty when ok. */
  problems: string[]
  winners: `0x${string}`[]
  amounts: bigint[]
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** Validates the organiser's winner rows the same way the contract will. */
export function checkWinnerRows(
  rows: WinnerRowInput[],
  pool: bigint,
  parseAmount: (text: string) => bigint | null,
  maxWinners: number,
): WinnerCheck {
  const problems: string[] = []
  const winners: `0x${string}`[] = []
  const amounts: bigint[] = []
  const seen = new Set<string>()

  if (rows.length === 0) problems.push('Add at least one winner.')
  if (rows.length > maxWinners) problems.push(`A purse can have at most ${maxWinners} winners.`)

  rows.forEach((row, i) => {
    const label = `Winner ${i + 1}`
    const address = row.address.trim()
    const amount = parseAmount(row.amount)
    if (!ADDRESS.test(address)) problems.push(`${label} needs a full wallet address.`)
    else if (/^0x0{40}$/.test(address)) problems.push(`${label} cannot be the zero address.`)
    else if (seen.has(address.toLowerCase())) problems.push(`${label} is listed twice.`)
    else seen.add(address.toLowerCase())
    if (amount === null || amount <= 0n) problems.push(`${label} needs an amount above zero.`)
    if (ADDRESS.test(address)) winners.push(address as `0x${string}`)
    amounts.push(amount !== null && amount > 0n ? amount : 0n)
  })

  const a = allocation(amounts, pool)
  if (a.status !== 'match') problems.push('The amounts must add up to exactly the pool.')

  return { ok: problems.length === 0, problems, winners, amounts }
}
