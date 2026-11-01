/**
 * Vercel serverless function: runs one real 0.01 USDC prize on the Purse contract and streams each step.
 *
 *   POST /api/demo   body: { "winner"?: "0x…" }   →   newline-delimited JSON events
 *
 * The demo wallet key comes from DEMO_PRIVATE_KEY and never leaves this function.
 * Every limit is checked against chain state, so no database is needed:
 *   - at most one run every 60 seconds (from the latest demo purse's creation time)
 *   - at most 50 runs in any 24 hours (counting demo purses created by the demo wallet)
 *   - one run per winner address (a Delivered event for that winner in a demo purse)
 *   - stop when the demo wallet holds less than 0.20 USDC
 * A demo purse stores its creation time in nameBy (creation time + NAME_BY_OFFSET), so no timestamps need fetching.
 *
 * This file imports nothing from src/ on purpose: Vercel bundles each function on its own.
 */
// arc-studio-allow-onchain-literal: the Arc mainnet RPC and USDC defaults below are the documented fallbacks for the VITE_* settings.

import {
  concat,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ---- Fixed demo rules (the only numbers this function is allowed to use) ----
export const TITLE = 'Demo purse'
export const PRIZE = 10_000n // 0.01 USDC, 6 decimals
export const MIN_BALANCE = 200_000n // 0.20 USDC
export const RUN_GAP_SECONDS = 60n
export const DAILY_LIMIT = 50
export const DAY_SECONDS = 86_400n
/** nameBy = creation time + this. Reading nameBy back gives the creation time without a block lookup. */
export const NAME_BY_OFFSET = 600n
export const CLAIM_WINDOW = 86_400n

export type DemoStep = 'check' | 'approve' | 'create' | 'lock' | 'name' | 'deliver'
export type DemoEvent =
  | { type: 'step'; step: DemoStep; status: 'pending' | 'done'; hash?: string; message?: string }
  | { type: 'done'; id: string; winner: string }
  | { type: 'error'; message: string; code?: string }

// ---- Limits (pure, tested) ----
export interface RunStats {
  /** Creation time of the latest demo run, or null if none. */
  last: bigint | null
  /** Runs started in the 24 hours before `now`. */
  inLastDay: number
}

export function runStats(createdAt: bigint[], now: bigint): RunStats {
  let last: bigint | null = null
  let inLastDay = 0
  for (const t of createdAt) {
    if (last === null || t > last) last = t
    if (t > now - DAY_SECONDS) inLastDay++
  }
  return { last, inLastDay }
}

export type Verdict = { ok: true } | { ok: false; code: 'low_balance' | 'too_soon' | 'daily_limit' | 'winner_used'; message: string }

export function evaluateLimits(input: { now: bigint; balance: bigint; stats: RunStats; winnerUsed: boolean }): Verdict {
  const { now, balance, stats, winnerUsed } = input
  if (balance < MIN_BALANCE) {
    return {
      ok: false,
      code: 'low_balance',
      message: 'The demo wallet is running low on USDC, so live runs are paused. The latest finished demo purse is still on the page.',
    }
  }
  if (stats.last !== null && now - stats.last < RUN_GAP_SECONDS) {
    const wait = Number(RUN_GAP_SECONDS - (now - stats.last))
    return { ok: false, code: 'too_soon', message: `A demo ran less than a minute ago. Try again in ${wait} second${wait === 1 ? '' : 's'}.` }
  }
  if (stats.inLastDay >= DAILY_LIMIT) {
    return { ok: false, code: 'daily_limit', message: `Today's ${DAILY_LIMIT} demo runs are used up. Try again later.` }
  }
  if (winnerUsed) {
    return { ok: false, code: 'winner_used', message: 'That address has already received a demo prize. Use a different address, or leave it empty.' }
  }
  return { ok: true }
}

/** Reads the optional winner from the request body. Returns null for "use the demo wallet's second address". */
export function parseWinner(body: unknown): { winner: Address | null } | { error: string } {
  const raw = body && typeof body === 'object' ? (body as { winner?: unknown }).winner : undefined
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return { winner: null }
  if (typeof raw !== 'string' || !isAddress(raw.trim(), { strict: false })) return { error: 'That is not a full Arc wallet address.' }
  const winner = getAddress(raw.trim().toLowerCase())
  if (/^0x0{40}$/.test(winner)) return { error: 'The winner cannot be the zero address.' }
  return { winner }
}

// ---- Config ----
interface Config {
  key: Hex
  purse: Address
  usdc: Address
  rpc: string
  chainId: number
  deployBlock: bigint
}

type Env = Record<string, string | undefined>

export function readConfig(env: Env): Config | null {
  const key = env.DEMO_PRIVATE_KEY?.trim()
  const purse = (env.PURSE_ADDRESS ?? env.VITE_PURSE_ADDRESS)?.trim() || '0xC81332357d6832d5FDDd8eCDC884Ef4e461c422B'
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key) || !purse || !isAddress(purse, { strict: false })) return null
  const block = Number(env.VITE_DEPLOY_BLOCK)
  return {
    key: key as Hex,
    purse: getAddress(purse.toLowerCase()),
    usdc: getAddress((env.VITE_USDC_ADDRESS?.trim() || '0x3600000000000000000000000000000000000000').toLowerCase()),
    rpc: env.VITE_RPC_URL?.trim() || 'https://rpc.mainnet.arc.io',
    chainId: Number(env.VITE_CHAIN_ID) || 5042,
    deployBlock: BigInt(Number.isInteger(block) && block > 0 ? block : 29024415),
  }
}

const purseAbi = parseAbi([
  'function create(string title, uint256 amount, uint64 nameBy, uint64 claimWindow) returns (uint256 id)',
  'function lock(uint256 id)',
  'function name(uint256 id, address[] winners, uint256[] amounts)',
  'function deliver(uint256 id, address winner)',
  'function purse(uint256 id) view returns ((address organiser, string title, uint64 nameBy, uint64 claimWindow, uint256 claimBy, bool named, bool locked, uint256 pool, uint256 owed, uint256 winnerCount))',
])
const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'])
const createdEvent = parseAbiItem('event PurseCreated(uint256 indexed id, address indexed organiser, string title, uint256 amount, uint64 nameBy, uint64 claimWindow)')
const deliveredEvent = parseAbiItem('event Delivered(uint256 indexed id, address indexed winner, uint256 amount, address caller)')

// ---- Small retry + wide-first log scan (same idea as src/lib/retry.ts and logs.ts) ----
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function errorText(error: unknown): string {
  let text = ''
  let current: unknown = error
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    const e = current as { message?: unknown; details?: unknown; status?: unknown; cause?: unknown }
    text += ` ${typeof e.message === 'string' ? e.message : ''} ${typeof e.details === 'string' ? e.details : ''} ${String(e.status ?? '')}`
    current = e.cause
  }
  return text.toLowerCase()
}

const isRateLimited = (error: unknown) => /\b429\b|too many requests|rate.?limit/.test(errorText(error))
const isRangeError = (error: unknown) =>
  !isRateLimited(error) && /block range|range (is )?too|too (large|wide|many)|exceed|more than \d+ results|limit of \d+|query returned more|response size/.test(errorText(error))

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!isRateLimited(error) || attempt >= 5) throw error
      await sleep(Math.min(6000, 400 * 2 ** attempt))
    }
  }
}

async function scan<T>(fetchRange: (from: bigint, to: bigint) => Promise<T[]>, from: bigint, to: bigint): Promise<T[]> {
  if (from > to) return []
  try {
    return await retry(() => fetchRange(from, to))
  } catch (error) {
    if (from < to && isRangeError(error)) {
      const mid = from + (to - from) / 2n
      return [...(await scan(fetchRange, from, mid)), ...(await scan(fetchRange, mid + 1n, to))]
    }
    throw error
  }
}

// ---- Handler ----
let busy = false
const encoder = new TextEncoder()

const json = (status: number, event: DemoEvent) =>
  new Response(JSON.stringify(event), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

function friendly(error: unknown): string {
  if (isRateLimited(error)) return 'The network is busy right now. Try again in a minute.'
  if (/insufficient funds|exceeds balance/.test(errorText(error))) return 'The demo wallet ran out of funds part-way. Live runs are paused.'
  return 'The run stopped part-way. Check the last transaction link above to see how far it got.'
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json(405, { type: 'error', code: 'method', message: 'Use POST.' })

  const config = readConfig(env)
  if (!config) return json(503, { type: 'error', code: 'unavailable', message: 'The live demo is not set up on this deployment.' })

  let body: unknown = {}
  try {
    const text = await request.text()
    if (text.length > 2000) return json(413, { type: 'error', message: 'That request is too large.' })
    body = text ? (JSON.parse(text) as unknown) : {}
  } catch {
    return json(400, { type: 'error', message: 'That request could not be read.' })
  }
  const parsed = parseWinner(body)
  if ('error' in parsed) return json(400, { type: 'error', code: 'bad_winner', message: parsed.error })

  if (busy) return json(429, { type: 'error', code: 'too_soon', message: 'A demo run is already in progress. Try again in a minute.' })
  busy = true

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: DemoEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        await run(config, parsed.winner, emit)
      } catch (error) {
        emit({ type: 'error', message: friendly(error) })
      } finally {
        busy = false
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  })
}

async function run(config: Config, requestedWinner: Address | null, emit: (event: DemoEvent) => void): Promise<void> {
  const chain = defineChain({
    id: config.chainId,
    name: 'Arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [config.rpc] } },
  })
  const account = privateKeyToAccount(config.key)
  const client = createPublicClient({ chain, transport: http(config.rpc, { retryCount: 1 }) })
  const wallet = createWalletClient({ account, chain, transport: http(config.rpc) })

  // The demo wallet's own second address: derived from the same secret, used when no winner is given.
  const secondAccount = privateKeyToAccount(keccak256(concat([config.key, toHex('purse-demo-second-address')])))
  const winner = requestedWinner ?? secondAccount.address
  if (winner.toLowerCase() === account.address.toLowerCase()) {
    emit({ type: 'error', code: 'bad_winner', message: 'Pick a winner address other than the demo wallet itself.' })
    return
  }

  emit({ type: 'step', step: 'check', status: 'pending' })
  const head = await retry(() => client.getBlockNumber())
  const [latest, balance, createdLogs, deliveredLogs] = await Promise.all([
    retry(() => client.getBlock({ blockNumber: head })),
    retry(() => client.readContract({ address: config.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })),
    scan(
      (fromBlock, toBlock) => client.getLogs({ address: config.purse, event: createdEvent, args: { organiser: account.address }, fromBlock, toBlock }),
      config.deployBlock,
      head,
    ),
    requestedWinner
      ? scan(
          (fromBlock, toBlock) => client.getLogs({ address: config.purse, event: deliveredEvent, args: { winner }, fromBlock, toBlock }),
          config.deployBlock,
          head,
        )
      : Promise.resolve([]),
  ])
  const now = latest.timestamp

  const demoCreatedAt = createdLogs.filter((log) => log.args.title === TITLE && log.args.nameBy !== undefined).map((log) => BigInt(log.args.nameBy ?? 0n) - NAME_BY_OFFSET)

  // A winner counts as used only if a demo purse (ours, titled "Demo purse") delivered to them.
  let winnerUsed = false
  for (const log of deliveredLogs) {
    if (log.args.id === undefined) continue
    const view = await retry(() => client.readContract({ address: config.purse, abi: purseAbi, functionName: 'purse', args: [log.args.id as bigint] }))
    if (view.title === TITLE && view.organiser.toLowerCase() === account.address.toLowerCase()) {
      winnerUsed = true
      break
    }
  }

  const verdict = evaluateLimits({ now, balance, stats: runStats(demoCreatedAt, now), winnerUsed })
  if (!verdict.ok) {
    emit({ type: 'error', code: verdict.code, message: verdict.message })
    return
  }
  emit({ type: 'step', step: 'check', status: 'done' })

  const send = async (step: DemoStep, to: Address, data: Hex) => {
    emit({ type: 'step', step, status: 'pending' })
    const hash = await wallet.sendTransaction({ to, data, account, chain })
    emit({ type: 'step', step, status: 'pending', hash })
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 45_000 })
    if (receipt.status !== 'success') throw new Error(`${step} reverted`)
    emit({ type: 'step', step, status: 'done', hash })
    return receipt
  }

  const allowance = await retry(() => client.readContract({ address: config.usdc, abi: erc20Abi, functionName: 'allowance', args: [account.address, config.purse] }))
  if (allowance < PRIZE) {
    await send('approve', config.usdc, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [config.purse, PRIZE] }))
  }

  const created = await send(
    'create',
    config.purse,
    encodeFunctionData({ abi: purseAbi, functionName: 'create', args: [TITLE, PRIZE, now + NAME_BY_OFFSET, CLAIM_WINDOW] }),
  )
  const id = parseEventLogs({ abi: [createdEvent], logs: created.logs, eventName: 'PurseCreated' })[0]?.args.id
  if (id === undefined) throw new Error('create gave no purse id')

  await send('lock', config.purse, encodeFunctionData({ abi: purseAbi, functionName: 'lock', args: [id] }))
  await send('name', config.purse, encodeFunctionData({ abi: purseAbi, functionName: 'name', args: [id, [winner], [PRIZE]] }))
  await send('deliver', config.purse, encodeFunctionData({ abi: purseAbi, functionName: 'deliver', args: [id, winner] }))

  emit({ type: 'done', id: id.toString(), winner })
}

export async function POST(request: Request): Promise<Response> {
  return handle(request, process.env)
}

export function GET(): Response {
  return json(405, { type: 'error', code: 'method', message: 'Use POST.' })
}
