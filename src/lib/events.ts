import { decodeEventLog, type Hex, type Log } from 'viem'
import { purseAbi } from './purse-abi'

type Address = `0x${string}`

interface Meta {
  blockNumber: bigint
  txHash: Hex
  logIndex: number
}

/** Every state change the contract announces, in the shape the app reads. */
export type PurseEvent = Meta &
  (
    | { name: 'PurseCreated'; id: bigint; organiser: Address; title: string; amount: bigint; nameBy: bigint; claimWindow: bigint }
    | { name: 'Funded'; id: bigint; funder: Address; amount: bigint; newPool: bigint }
    | { name: 'FundingLocked'; id: bigint; pool: bigint }
    | { name: 'WinnersNamed'; id: bigint; winners: Address[]; amounts: bigint[]; claimBy: bigint }
    | { name: 'Delivered'; id: bigint; winner: Address; amount: bigint; caller: Address }
    | { name: 'Refunded'; id: bigint; funder: Address; amount: bigint }
    | { name: 'Swept'; id: bigint; organiser: Address; amount: bigint; caller: Address }
  )

export const eventKey = (e: Pick<PurseEvent, 'txHash' | 'logIndex'>) => `${e.txHash}:${e.logIndex}`

export function sortEvents(events: PurseEvent[]): PurseEvent[] {
  return [...events].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  )
}

/** Decodes a raw log from the Purse contract; returns null for anything else. */
export function decodePurseLog(log: Pick<Log, 'data' | 'topics' | 'blockNumber' | 'transactionHash' | 'logIndex'>): PurseEvent | null {
  if (log.blockNumber == null || log.transactionHash == null || log.logIndex == null) return null
  let decoded
  try {
    decoded = decodeEventLog({ abi: purseAbi, data: log.data, topics: log.topics })
  } catch {
    return null
  }
  const meta: Meta = { blockNumber: log.blockNumber, txHash: log.transactionHash, logIndex: log.logIndex }
  switch (decoded.eventName) {
    case 'PurseCreated':
      return { ...meta, name: 'PurseCreated', id: decoded.args.id, organiser: decoded.args.organiser, title: decoded.args.title, amount: decoded.args.amount, nameBy: BigInt(decoded.args.nameBy), claimWindow: BigInt(decoded.args.claimWindow) }
    case 'Funded':
      return { ...meta, name: 'Funded', id: decoded.args.id, funder: decoded.args.funder, amount: decoded.args.amount, newPool: decoded.args.newPool }
    case 'FundingLocked':
      return { ...meta, name: 'FundingLocked', id: decoded.args.id, pool: decoded.args.pool }
    case 'WinnersNamed':
      return { ...meta, name: 'WinnersNamed', id: decoded.args.id, winners: [...decoded.args.winners], amounts: [...decoded.args.amounts], claimBy: decoded.args.claimBy }
    case 'Delivered':
      return { ...meta, name: 'Delivered', id: decoded.args.id, winner: decoded.args.winner, amount: decoded.args.amount, caller: decoded.args.caller }
    case 'Refunded':
      return { ...meta, name: 'Refunded', id: decoded.args.id, funder: decoded.args.funder, amount: decoded.args.amount }
    case 'Swept':
      return { ...meta, name: 'Swept', id: decoded.args.id, organiser: decoded.args.organiser, amount: decoded.args.amount, caller: decoded.args.caller }
    default:
      return null
  }
}

/** JSON with bigint support, used for the localStorage cache. */
export function serializeEvents(events: PurseEvent[]): string {
  return JSON.stringify(events, (_k, v: unknown) => (typeof v === 'bigint' ? { __bigint: v.toString() } : v))
}

export function deserializeEvents(text: string): PurseEvent[] {
  const parsed: unknown = JSON.parse(text, (_k, v: unknown) =>
    v && typeof v === 'object' && '__bigint' in v ? BigInt((v as { __bigint: string }).__bigint) : v,
  )
  if (!Array.isArray(parsed)) throw new Error('Cached history is not a list')
  return parsed as PurseEvent[]
}
