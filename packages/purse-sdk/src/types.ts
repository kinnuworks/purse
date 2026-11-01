import type { Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem'

export type Address = `0x${string}`

export type PurseState = 'Open' | 'Locked' | 'Winners named' | 'Paid out' | 'Returned' | 'Refunds open'

export interface Winner {
  winner: Address
  /** USDC in its smallest unit (6 decimals). 1 USDC is 1_000_000n. */
  amount: bigint
  delivered: boolean
}

export interface Purse {
  id: bigint
  organiser: Address
  title: string
  /** Unix seconds. Winners must be named by this time. */
  nameBy: bigint
  /** Seconds winners have to claim, counted from the moment winners are named. */
  claimWindow: bigint
  /** Unix seconds. 0n until winners are named. */
  claimBy: bigint
  named: boolean
  locked: boolean
  /** Total USDC put in, minus anything refunded. */
  pool: bigint
  /** USDC the contract still holds for this purse. */
  owed: bigint
  winners: Winner[]
  state: PurseState
}

export interface PurseConfig {
  publicClient: PublicClient
  /** Needed for anything that sends a transaction. Reads work without it. */
  walletClient?: WalletClient
  /** The Purse contract. */
  purse: Address
  /** The USDC token the contract uses (6 decimals). */
  usdc: Address
}

export interface TxResult {
  hash: Hex
  receipt: TransactionReceipt
}

export interface CreateResult extends TxResult {
  /** The new purse's number. */
  id: bigint
  /** Set when an approval had to be sent first. */
  approvalHash?: Hex
}

export interface CreateInput {
  title: string
  /** USDC in its smallest unit. Use `parseUsdc("25.50")`. */
  amount: bigint
  /** When winners must be named by: a Date, or unix seconds. Must be in the future. */
  nameBy: Date | bigint | number
  /** Seconds winners have to claim after being named. The contract allows 60 at least. */
  claimWindow: bigint | number
}

export interface WinnerInput {
  winner: Address
  amount: bigint
}
