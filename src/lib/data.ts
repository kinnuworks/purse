import { createPublicClient, defineChain, erc20Abi, http, type Hex } from 'viem'
import { ONCHAIN_CHAINS } from '@/onchain-facts'
import { publicClient } from './chain'
import { PURSE_ADDRESS, USDC_ADDRESS } from './env'
import { purseAbi } from './purse-abi'
import { mapLimit, withRetry } from './retry'
import type { PurseSnapshot } from './purse-state'

type Address = `0x${string}`

export interface WinnerData {
  winner: Address
  amount: bigint
  delivered: boolean
}

export interface PurseData extends PurseSnapshot {
  id: bigint
  organiser: Address
  title: string
  claimWindow: bigint
  winnerCount: bigint
  winners: WinnerData[]
}

function contract(): Address {
  if (!PURSE_ADDRESS) throw new Error('The Purse contract address is not set.')
  return PURSE_ADDRESS
}

export async function readPurseCount(): Promise<bigint> {
  return withRetry(() => publicClient.readContract({ address: contract(), abi: purseAbi, functionName: 'purseCount' }))
}

export async function readPurse(id: bigint): Promise<PurseData> {
  const address = contract()
  const view = await withRetry(() => publicClient.readContract({ address, abi: purseAbi, functionName: 'purse', args: [id] }))
  const winners =
    view.winnerCount > 0n
      ? await withRetry(() => publicClient.readContract({ address, abi: purseAbi, functionName: 'winnersOf', args: [id] }))
      : []
  return {
    id,
    organiser: view.organiser,
    title: view.title,
    nameBy: BigInt(view.nameBy),
    claimWindow: BigInt(view.claimWindow),
    claimBy: view.claimBy,
    named: view.named,
    locked: view.locked,
    pool: view.pool,
    owed: view.owed,
    winnerCount: view.winnerCount,
    winners: winners.map((w) => ({ winner: w.winner, amount: w.amount, delivered: w.delivered })),
  }
}

/** Every purse, newest first. */
export async function readPurseList(): Promise<PurseData[]> {
  const count = await readPurseCount()
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(Number(count) - 1 - i))
  return mapLimit(ids, 4, readPurse)
}

export async function readContribution(id: bigint, funder: Address): Promise<bigint> {
  return withRetry(() =>
    publicClient.readContract({ address: contract(), abi: purseAbi, functionName: 'contributionOf', args: [id, funder] }),
  )
}

export async function readMinClaimWindow(): Promise<bigint> {
  const value = await withRetry(() => publicClient.readContract({ address: contract(), abi: purseAbi, functionName: 'MIN_CLAIM_WINDOW' }))
  return BigInt(value)
}

export async function readMaxWinners(): Promise<number> {
  return Number(await withRetry(() => publicClient.readContract({ address: contract(), abi: purseAbi, functionName: 'MAX_WINNERS' })))
}

/** USDC in the 6-decimal ERC-20 view. On Arc this is the same pool that pays gas. */
export async function readUsdcBalance(owner: Address): Promise<bigint> {
  return withRetry(() => publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }))
}

export async function readAllowance(owner: Address): Promise<bigint> {
  return withRetry(() =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, contract()] }),
  )
}

export async function readBlockTime(block: bigint): Promise<number> {
  const found = await publicClient.getBlock({ blockNumber: block })
  return Number(found.timestamp)
}

export type ProofNetwork = 'mainnet' | 'testnet'

const testnetFact = ONCHAIN_CHAINS.find((c) => c.scpBlockchain === 'ARC-TESTNET')
export const TESTNET_EXPLORER = testnetFact?.explorerBase ?? ''
export const testnetTxUrl = (hash: string) => `${TESTNET_EXPLORER}/tx/${hash}`
export const testnetAddressUrl = (address: string) => `${TESTNET_EXPLORER}/address/${address}`

const testnetClient = testnetFact
  ? createPublicClient({
      chain: defineChain({
        id: testnetFact.chainId,
        name: testnetFact.name,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: { default: { http: testnetFact.rpcUrls } },
      }),
      transport: http(testnetFact.rpcUrls[0], { retryCount: 1 }),
    })
  : null

export async function readTransaction(hash: Hex, network: ProofNetwork = 'mainnet') {
  const client = network === 'testnet' ? testnetClient : publicClient
  if (!client) throw new Error('Arc testnet is not available.')
  const [tx, receipt] = await Promise.all([
    withRetry(() => client.getTransaction({ hash })),
    withRetry(() => client.getTransactionReceipt({ hash })),
  ])
  const block = await withRetry(() => client.getBlock({ blockNumber: receipt.blockNumber }))
  return { from: tx.from, to: tx.to, status: receipt.status, timestamp: Number(block.timestamp) }
}
