import { erc20Abi, formatUnits, parseEventLogs, parseUnits, type Account, type Hex } from 'viem'
import { purseAbi } from './abi.js'
import { PurseError, toPurseError } from './errors.js'
import type { Address, CreateInput, CreateResult, Purse, PurseConfig, PurseState, TxResult, Winner, WinnerInput } from './types.js'

/** "25.50" becomes 25_500_000n. USDC has 6 decimals. */
export const parseUsdc = (value: string): bigint => parseUnits(value, 6)
/** 25_500_000n becomes "25.5". */
export const formatUsdc = (value: bigint): string => formatUnits(value, 6)

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000))

/** What a purse is doing, from its fields and the current time (unix seconds). */
export function deriveState(p: Pick<Purse, 'named' | 'locked' | 'nameBy' | 'owed' | 'winners'>, now: bigint): PurseState {
  if (!p.named) {
    if (now <= p.nameBy) return p.locked ? 'Locked' : 'Open'
    return p.owed === 0n ? 'Returned' : 'Refunds open'
  }
  if (p.owed > 0n) return 'Winners named'
  return p.winners.length > 0 && p.winners.every((w) => w.delivered) ? 'Paid out' : 'Returned'
}

/**
 * Connects the SDK to a Purse contract. Every method either resolves or throws a `PurseError`
 * with a stable `code` and a plain-language `message`.
 */
export function connectPurse(config: PurseConfig) {
  const { publicClient, walletClient, purse: address, usdc } = config

  const requireAccount = (): Account => {
    const account = walletClient?.account
    if (!walletClient || !account) {
      throw new PurseError('NO_WALLET', 'This needs a wallet client with an account. Pass `walletClient` to connectPurse.')
    }
    return account
  }

  const confirm = async (hash: Hex): Promise<TxResult> => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new PurseError('TX_REVERTED', 'The transaction was included in a block but failed.')
    }
    return { hash, receipt }
  }

  /** Runs a call and turns anything it throws into a PurseError. */
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      throw toPurseError(error)
    }
  }

  async function getPurse(id: bigint, options: { now?: bigint } = {}): Promise<Purse> {
    return guard(async () => {
      const view = await publicClient.readContract({ address, abi: purseAbi, functionName: 'purse', args: [id] })
      const rows = view.winnerCount > 0n ? await publicClient.readContract({ address, abi: purseAbi, functionName: 'winnersOf', args: [id] }) : []
      const winners: Winner[] = rows.map((w) => ({ winner: w.winner, amount: w.amount, delivered: w.delivered }))
      const base = {
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
        winners,
      }
      return { ...base, state: deriveState(base, options.now ?? nowSeconds()) }
    })
  }

  /** Purses newest first. `limit` defaults to 50; `offset` skips that many of the newest. */
  async function listPurses(options: { limit?: number; offset?: number } = {}): Promise<Purse[]> {
    return guard(async () => {
      const { limit = 50, offset = 0 } = options
      const count = await publicClient.readContract({ address, abi: purseAbi, functionName: 'purseCount' })
      const ids: bigint[] = []
      for (let i = BigInt(offset); i < count && ids.length < limit; i++) ids.push(count - 1n - i)
      const now = nowSeconds()
      const out: Purse[] = []
      for (let i = 0; i < ids.length; i += 4) {
        out.push(...(await Promise.all(ids.slice(i, i + 4).map((id) => getPurse(id, { now })))))
      }
      return out
    })
  }

  /** Creates a purse and pulls the prize from the wallet, sending a USDC approval first if the allowance is too low. */
  async function createPurse(input: CreateInput): Promise<CreateResult> {
    return guard(async () => {
      const account = requireAccount()
      const nameBy = input.nameBy instanceof Date ? BigInt(Math.floor(input.nameBy.getTime() / 1000)) : BigInt(input.nameBy)
      const claimWindow = BigInt(input.claimWindow)
      if (input.amount <= 0n) throw new PurseError('ZERO_AMOUNT', 'An amount must be more than zero.')
      if (nameBy <= nowSeconds()) throw new PurseError('INVALID_DEADLINES', 'The deadline to name winners has to be in the future.')

      let approvalHash: Hex | undefined
      const allowance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account.address, address] })
      if (allowance < input.amount) {
        const { request } = await publicClient.simulateContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [address, input.amount], account })
        approvalHash = (await confirm(await walletClient!.writeContract(request))).hash
      }

      const { request } = await publicClient.simulateContract({
        address,
        abi: purseAbi,
        functionName: 'create',
        args: [input.title, input.amount, nameBy, claimWindow],
        account,
      })
      const tx = await confirm(await walletClient!.writeContract(request))
      const created = parseEventLogs({ abi: purseAbi, logs: tx.receipt.logs, eventName: 'PurseCreated' })[0]
      if (!created) throw new PurseError('UNKNOWN', 'The purse was created but its number could not be read from the receipt.')
      return { ...tx, id: created.args.id, approvalHash }
    })
  }

  /** Ends funding. The organiser must lock before naming winners, so nobody can change the pool at the last second. */
  async function lock(id: bigint): Promise<TxResult> {
    return guard(async () => {
      const account = requireAccount()
      const { request } = await publicClient.simulateContract({ address, abi: purseAbi, functionName: 'lock', args: [id], account })
      return confirm(await walletClient!.writeContract(request))
    })
  }

  /** Names the winners. Their amounts must add up to exactly the pool. Can be done once. */
  async function nameWinners(id: bigint, winners: readonly WinnerInput[]): Promise<TxResult> {
    return guard(async () => {
      const account = requireAccount()
      const { request } = await publicClient.simulateContract({
        address,
        abi: purseAbi,
        functionName: 'name',
        args: [id, winners.map((w) => w.winner), winners.map((w) => w.amount)],
        account,
      })
      return confirm(await walletClient!.writeContract(request))
    })
  }

  /** Sends a winner their prize. Anyone can call it; the money always goes to the winner. */
  async function deliver(id: bigint, winner: Address): Promise<TxResult> {
    return guard(async () => {
      const account = requireAccount()
      const { request } = await publicClient.simulateContract({ address, abi: purseAbi, functionName: 'deliver', args: [id, winner], account })
      return confirm(await walletClient!.writeContract(request))
    })
  }

  /** Returns a funder's own contribution when the naming deadline passed with no winners. Anyone can call it. */
  async function refund(id: bigint, funder: Address): Promise<TxResult> {
    return guard(async () => {
      const account = requireAccount()
      const { request } = await publicClient.simulateContract({ address, abi: purseAbi, functionName: 'refund', args: [id, funder], account })
      return confirm(await walletClient!.writeContract(request))
    })
  }

  /** After the claim deadline, sends undelivered prize money back to the organiser. Anyone can call it. */
  async function sweep(id: bigint): Promise<TxResult> {
    return guard(async () => {
      const account = requireAccount()
      const { request } = await publicClient.simulateContract({ address, abi: purseAbi, functionName: 'sweep', args: [id], account })
      return confirm(await walletClient!.writeContract(request))
    })
  }

  return { getPurse, listPurses, createPurse, lock, nameWinners, deliver, refund, sweep }
}

export type PurseClient = ReturnType<typeof connectPurse>
