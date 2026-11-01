import { encodeFunctionData, type Hex } from 'viem'
import type { PurseData } from './data'
import { purseAbi } from './purse-abi'
import { deriveState, isTestOrDemo, type PurseState } from './purse-state'

type Address = `0x${string}`

/**
 * An address that holds nothing and plays no part in any purse. It stands in for "a stranger"
 * when a simulation needs a caller who is not the organiser and not a winner.
 */
export const STRANGER: Address = '0x000000000000000000000000000000000000dEaD'

export interface AttackPlan {
  key: string
  /** The attack in a few plain words. */
  title: string
  /** What the simulated call tries to do. */
  how: string
  /** What the contract's refusal means. */
  meaning: string
  /** The error the contract should answer with. */
  expect: string
  /** Null when no purse on chain makes this simulation meaningful. */
  target: null | {
    purseId: bigint
    purseTitle: string
    purseState: PurseState
    caller: Address
    callerLabel: string
    to: 'purse'
    data: Hex
  }
  /** Why there is nothing to simulate, when target is null. */
  unavailable?: string
  /** A caveat to show when the best purse available is not the ideal one. */
  note?: string
}

type Pick = (p: PurseData) => boolean

/** Newest first among real purses, then among test and demo purses. */
function choose(purses: readonly PurseData[], ...preferences: Pick[]): PurseData | undefined {
  const newest = [...purses].sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1))
  const ordered = [...newest.filter((p) => !isTestOrDemo(p.title)), ...newest.filter((p) => isTestOrDemo(p.title))]
  for (const wants of preferences) {
    const found = ordered.find(wants)
    if (found) return found
  }
  return undefined
}

const data = {
  refund: (id: bigint, funder: Address): Hex => encodeFunctionData({ abi: purseAbi, functionName: 'refund', args: [id, funder] }),
  sweep: (id: bigint): Hex => encodeFunctionData({ abi: purseAbi, functionName: 'sweep', args: [id] }),
  deliver: (id: bigint, winner: Address): Hex => encodeFunctionData({ abi: purseAbi, functionName: 'deliver', args: [id, winner] }),
  name: (id: bigint, winners: Address[], amounts: bigint[]): Hex => encodeFunctionData({ abi: purseAbi, functionName: 'name', args: [id, winners, amounts] }),
}

export function planAttacks(purses: readonly PurseData[], now: bigint): AttackPlan[] {
  const unnamedInTime: Pick = (p) => !p.named && now <= p.nameBy
  const lockedInTime: Pick = (p) => unnamedInTime(p) && p.locked
  const claimOpen: Pick = (p) => p.named && now < p.claimBy
  const state = (p: PurseData) => deriveState(p, now)

  const target = (p: PurseData, caller: Address, callerLabel: string, calldata: Hex): NonNullable<AttackPlan['target']> => ({
    purseId: p.id,
    purseTitle: p.title,
    purseState: state(p),
    caller,
    callerLabel,
    to: 'purse',
    data: calldata,
  })
  const organiserLabel = 'the organiser of that purse'
  const none = (why: string) => ({ target: null, unavailable: why })

  const plans: AttackPlan[] = []

  // 1. The organiser takes back a locked prize.
  {
    const p = choose(purses, lockedInTime, unnamedInTime)
    plans.push({
      key: 'take-back',
      title: 'The organiser takes back a locked prize',
      how: 'The organiser asks for their own money back with refund(), before the naming deadline.',
      meaning: 'Nobody, including the organiser, can pull money out while a purse is waiting for winners. Refunds open only after the deadline passes with no winners named.',
      expect: 'RefundNotAvailable',
      ...(p ? { target: target(p, p.organiser, organiserLabel, data.refund(p.id, p.organiser)) } : none('No purse is waiting for winners right now, so there is nothing to try this on.')),
      note: p && !p.locked ? 'No purse is locked right now, so this uses one that is still open. The contract refuses in the same way.' : undefined,
    })
  }

  // 2. The organiser names winners twice.
  {
    const p = choose(purses, (x) => x.named && x.winners.length > 0)
    plans.push({
      key: 'name-twice',
      title: 'The organiser names winners twice',
      how: 'The organiser sends the winners list again for a purse that already has winners.',
      meaning: 'Winners can be named once. After that the list can never be changed or replaced.',
      expect: 'AlreadyNamed',
      ...(p
        ? { target: target(p, p.organiser, organiserLabel, data.name(p.id, p.winners.map((w) => w.winner), p.winners.map((w) => w.amount))) }
        : none('No purse has named winners yet, so there is nothing to try this on.')),
    })
  }

  // 3. The organiser names less than the whole pool.
  {
    const p = choose(purses, (x) => lockedInTime(x) && x.pool >= 2n)
    plans.push({
      key: 'short-pool',
      title: 'The organiser names less than the whole pool',
      how: 'The organiser names one winner for the pool minus the smallest possible amount, hoping to keep the rest.',
      meaning: 'The prizes must add up to exactly the pool, so the organiser cannot quietly keep any of it.',
      expect: 'AmountsDoNotMatchPool',
      ...(p
        ? { target: target(p, p.organiser, organiserLabel, data.name(p.id, [p.organiser], [p.pool - 1n])) }
        : none('This needs a purse that is locked and still inside its naming deadline. None exists right now, so it is not faked.')),
    })
  }

  // 4. A stranger names winners.
  {
    const p = choose(purses, unnamedInTime, () => true)
    plans.push({
      key: 'stranger-names',
      title: 'A stranger names winners on a purse',
      how: 'An address with no role in the purse names itself as the winner of the whole pool.',
      meaning: 'Only the organiser who created the purse can name its winners.',
      expect: 'NotOrganiser',
      ...(p ? { target: target(p, STRANGER, 'a stranger', data.name(p.id, [STRANGER], [p.pool])) } : none('There are no purses yet.')),
    })
  }

  // 5. A winner is paid twice.
  {
    const p = choose(purses, (x) => claimOpen(x) && x.winners.some((w) => w.delivered))
    const winner = p?.winners.find((w) => w.delivered)
    plans.push({
      key: 'paid-twice',
      title: 'A winner is paid twice',
      how: 'Anyone asks for a prize to be delivered again to a winner who has already received it.',
      meaning: 'Each prize can be delivered once. The second request is refused, so the pool cannot be drained by repeating it.',
      expect: 'AlreadyDelivered',
      ...(p && winner
        ? { target: target(p, STRANGER, 'anyone (a stranger)', data.deliver(p.id, winner.winner)) }
        : none('This needs a delivered prize on a purse whose claim window is still open. None exists right now, so it is not faked.')),
    })
  }

  // 6. A stranger redirects a prize to themselves.
  {
    const p = choose(purses, (x) => claimOpen(x) && x.winners.some((w) => !w.delivered), claimOpen)
    plans.push({
      key: 'redirect',
      title: 'A stranger redirects a prize to themselves',
      how: 'A stranger calls deliver() with their own address instead of a winner’s.',
      meaning: 'Delivery only pays addresses on the winners list, and always pays the winner, never the caller.',
      expect: 'NotAWinner',
      ...(p
        ? { target: target(p, STRANGER, 'a stranger', data.deliver(p.id, STRANGER)) }
        : none('This needs a purse with named winners whose claim window is still open. None exists right now, so it is not faked.')),
    })
  }

  // 7. A refund after winners are named.
  {
    const p = choose(purses, (x) => x.named && x.owed > 0n, (x) => x.named)
    plans.push({
      key: 'refund-after-named',
      title: 'A refund after winners are named',
      how: 'The organiser, who put money in, asks for their contribution back after the winners were named.',
      meaning: 'Once winners are named the money belongs to them. Refunds exist only for purses that never got winners.',
      expect: 'RefundNotAvailable',
      ...(p ? { target: target(p, p.organiser, organiserLabel, data.refund(p.id, p.organiser)) } : none('No purse has named winners yet, so there is nothing to try this on.')),
    })
  }

  // 8. A sweep before the claim deadline.
  {
    const p = choose(purses, (x) => claimOpen(x) && x.owed > 0n, claimOpen)
    plans.push({
      key: 'early-sweep',
      title: 'A sweep before the claim deadline',
      how: 'The organiser asks for unclaimed prize money back while winners are still inside their claim window.',
      meaning: 'Winners keep their full claim window. Unclaimed money can only go back to the organiser after it ends.',
      expect: 'ClaimWindowOpen',
      ...(p
        ? { target: target(p, p.organiser, organiserLabel, data.sweep(p.id)) }
        : none('This needs a purse with named winners whose claim window is still open. None exists right now, so it is not faked.')),
    })
  }

  return plans
}

export type SimulationResult =
  | { outcome: 'blocked'; reason: string; name: string; matchesExpected: boolean }
  | { outcome: 'succeeded' }
  | { outcome: 'error'; message: string }

/** Turns what the simulated call did into a result. A call that goes through is a failure of the contract's rules. */
export function classifySimulation(attempt: { ok: true } | { ok: false; revert: { name: string; text: string } | null; message: string }, expect: string): SimulationResult {
  if (attempt.ok) return { outcome: 'succeeded' }
  if (!attempt.revert) return { outcome: 'error', message: attempt.message }
  return { outcome: 'blocked', reason: attempt.revert.text, name: attempt.revert.name, matchesExpected: attempt.revert.name === expect }
}
