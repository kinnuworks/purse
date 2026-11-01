import {
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { purseAbi } from './abi.js'
import { connectPurse, deriveState, formatUsdc, parseUsdc } from './client.js'
import { PurseError, isPurseError, toPurseError } from './errors.js'

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as const
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const
const PURSE = addr(0x100)
const USDC = addr(0x200)
const ME = addr(0xa1)
const WINNER = addr(0xb2)
const FUTURE = BigInt(Math.floor(Date.now() / 1000) + 3600)

const view = (over: Record<string, unknown> = {}) => ({
  organiser: ME,
  title: 'Spring hackathon',
  nameBy: FUTURE,
  claimWindow: 600n,
  claimBy: 0n,
  named: false,
  locked: false,
  pool: 5_000_000n,
  owed: 5_000_000n,
  winnerCount: 0n,
  ...over,
})

const okReceipt = (logs: unknown[] = []) => ({ status: 'success' as const, logs })

function createdLog(id: bigint) {
  return {
    address: PURSE,
    topics: encodeEventTopics({ abi: purseAbi, eventName: 'PurseCreated', args: { id, organiser: ME } }),
    data: encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint64' }],
      ['Spring hackathon', 5_000_000n, FUTURE, 600n],
    ),
    blockNumber: 1n,
    transactionHash: hash(1),
    logIndex: 0,
    blockHash: hash(2),
    transactionIndex: 0,
    removed: false,
  }
}

interface Mocks {
  read?: (args: { functionName: string; args?: readonly unknown[] }) => unknown
  simulate?: (args: Record<string, unknown>) => unknown
  receipt?: () => unknown
  write?: () => unknown
}

function setup(mocks: Mocks = {}, withWallet = true) {
  const readContract = vi.fn((args: { functionName: string; args?: readonly unknown[] }) => Promise.resolve(mocks.read ? mocks.read(args) : undefined))
  const simulateContract = vi.fn((args: Record<string, unknown>) => {
    if (mocks.simulate) {
      const out = mocks.simulate(args)
      if (out instanceof Error) return Promise.reject(out)
      return Promise.resolve(out)
    }
    return Promise.resolve({ request: { simulated: args.functionName } })
  })
  const waitForTransactionReceipt = vi.fn(() => Promise.resolve(mocks.receipt ? mocks.receipt() : okReceipt()))
  const writeContract = vi.fn(() => {
    const out = mocks.write ? mocks.write() : hash(7)
    if (out instanceof Error) return Promise.reject(out)
    return Promise.resolve(out)
  })
  const publicClient = { readContract, simulateContract, waitForTransactionReceipt } as unknown as PublicClient
  const walletClient = withWallet ? ({ account: { address: ME, type: 'json-rpc' }, writeContract } as unknown as WalletClient) : undefined
  return { sdk: connectPurse({ publicClient, walletClient, purse: PURSE, usdc: USDC }), readContract, simulateContract, writeContract, waitForTransactionReceipt }
}

const revert = (errorName: string, args: unknown[] = []) => {
  const data = encodeErrorResult({ abi: purseAbi, errorName, args } as never)
  return new ContractFunctionRevertedError({ abi: purseAbi, data, functionName: 'lock' })
}

describe('reading', () => {
  it('getPurse returns the purse with winners and a plain state', async () => {
    const { sdk } = setup({
      read: ({ functionName }) =>
        functionName === 'purse'
          ? view({ named: true, locked: true, claimBy: FUTURE, winnerCount: 1n })
          : [{ winner: WINNER, amount: 5_000_000n, delivered: false }],
    })
    const p = await sdk.getPurse(3n)
    expect(p).toMatchObject({ id: 3n, title: 'Spring hackathon', organiser: ME, pool: 5_000_000n, state: 'Winners named' })
    expect(p.winners).toEqual([{ winner: WINNER, amount: 5_000_000n, delivered: false }])
  })

  it('getPurse skips the winners read when nobody is named', async () => {
    const { sdk, readContract } = setup({ read: () => view({ locked: true }) })
    expect((await sdk.getPurse(0n)).state).toBe('Locked')
    expect(readContract).toHaveBeenCalledTimes(1)
  })

  it('listPurses returns the newest first and honours limit and offset', async () => {
    const { sdk } = setup({ read: ({ functionName, args }) => (functionName === 'purseCount' ? 5n : view({ title: `Purse ${String(args?.[0])}` })) })
    expect((await sdk.listPurses({ limit: 3 })).map((p) => p.id)).toEqual([4n, 3n, 2n])
    expect((await sdk.listPurses({ limit: 2, offset: 3 })).map((p) => p.id)).toEqual([1n, 0n])
    expect(await sdk.listPurses({ offset: 9 })).toEqual([])
  })

  it('reading an unknown purse gives a typed error', async () => {
    const { sdk, readContract } = setup()
    readContract.mockRejectedValueOnce(revert('UnknownPurse', [9n]))
    await expect(sdk.getPurse(9n)).rejects.toMatchObject({ code: 'UNKNOWN_PURSE', contractError: 'UnknownPurse', args: [9n] })
  })
})

describe('createPurse', () => {
  const input = { title: 'Spring hackathon', amount: 5_000_000n, nameBy: FUTURE, claimWindow: 600n }

  it('approves first when the allowance is too low, then creates and returns the new id', async () => {
    const { sdk, simulateContract, writeContract } = setup({
      read: () => 0n,
      receipt: () => okReceipt([createdLog(7n)]),
      write: (() => {
        let n = 0
        return () => hash(++n)
      })(),
    })
    const result = await sdk.createPurse(input)
    expect(result.id).toBe(7n)
    expect(result.approvalHash).toBe(hash(1))
    expect(result.hash).toBe(hash(2))
    expect(simulateContract.mock.calls.map((c) => (c[0] as { functionName: string }).functionName)).toEqual(['approve', 'create'])
    expect(simulateContract.mock.calls[0][0]).toMatchObject({ address: USDC, args: [PURSE, 5_000_000n] })
    expect(simulateContract.mock.calls[1][0]).toMatchObject({ address: PURSE, args: ['Spring hackathon', 5_000_000n, FUTURE, 600n] })
    expect(writeContract).toHaveBeenCalledTimes(2)
  })

  it('skips the approval when the allowance already covers the prize', async () => {
    const { sdk, simulateContract } = setup({ read: () => 10_000_000n, receipt: () => okReceipt([createdLog(2n)]) })
    const result = await sdk.createPurse({ ...input, nameBy: new Date(Number(FUTURE) * 1000), claimWindow: 600 })
    expect(result.approvalHash).toBeUndefined()
    expect(simulateContract.mock.calls.map((c) => (c[0] as { functionName: string }).functionName)).toEqual(['create'])
  })

  it('refuses a zero prize or a past deadline before touching the network', async () => {
    const { sdk, readContract } = setup()
    await expect(sdk.createPurse({ ...input, amount: 0n })).rejects.toMatchObject({ code: 'ZERO_AMOUNT' })
    await expect(sdk.createPurse({ ...input, nameBy: 1n })).rejects.toMatchObject({ code: 'INVALID_DEADLINES' })
    expect(readContract).not.toHaveBeenCalled()
  })
})

describe('writes', () => {
  it.each([
    ['lock', (s: ReturnType<typeof setup>['sdk']) => s.lock(4n), [4n]],
    ['name', (s: ReturnType<typeof setup>['sdk']) => s.nameWinners(4n, [{ winner: WINNER, amount: 5_000_000n }]), [4n, [WINNER], [5_000_000n]]],
    ['deliver', (s: ReturnType<typeof setup>['sdk']) => s.deliver(4n, WINNER), [4n, WINNER]],
    ['refund', (s: ReturnType<typeof setup>['sdk']) => s.refund(4n, ME), [4n, ME]],
    ['sweep', (s: ReturnType<typeof setup>['sdk']) => s.sweep(4n), [4n]],
  ] as const)('%s simulates as the wallet, sends, and returns the hash and receipt', async (functionName, run, args) => {
    const { sdk, simulateContract, writeContract } = setup()
    const result = await run(sdk)
    expect(result.hash).toBe(hash(7))
    expect(result.receipt.status).toBe('success')
    expect(simulateContract).toHaveBeenCalledWith(expect.objectContaining({ address: PURSE, functionName, args, account: expect.objectContaining({ address: ME }) }))
    expect(writeContract).toHaveBeenCalledTimes(1)
  })
})

describe('plain typed errors', () => {
  it('turns a contract refusal into a code, a sentence and the contract’s own error', async () => {
    const { sdk, writeContract } = setup({ simulate: () => revert('NotOrganiser', [addr(1), addr(2)]) })
    const error = await sdk.lock(1n).catch((e: unknown) => e)
    expect(isPurseError(error)).toBe(true)
    expect(error).toMatchObject({ code: 'NOT_ORGANISER', contractError: 'NotOrganiser', args: [addr(1), addr(2)] })
    expect((error as PurseError).message).toBe('Only the organiser of this purse can do that.')
    expect(writeContract).not.toHaveBeenCalled()
  })

  it.each([
    ['AmountsDoNotMatchPool', [5n, 4n], 'AMOUNTS_DO_NOT_MATCH_POOL'],
    ['NotLocked', [1n], 'NOT_LOCKED'],
    ['AlreadyNamed', [], 'ALREADY_NAMED'],
    ['AlreadyDelivered', [WINNER], 'ALREADY_DELIVERED'],
    ['RefundNotAvailable', [], 'REFUND_NOT_AVAILABLE'],
    ['ClaimWindowOpen', [], 'CLAIM_WINDOW_OPEN'],
  ] as const)('%s becomes %s', async (name, args, code) => {
    const { sdk } = setup({ simulate: () => revert(name, [...args]) })
    await expect(sdk.nameWinners(1n, [{ winner: WINNER, amount: 1n }])).rejects.toMatchObject({ code })
  })

  it('reports a cancelled wallet request', async () => {
    const { sdk } = setup({ write: () => new UserRejectedRequestError(new Error('no')) })
    await expect(sdk.lock(1n)).rejects.toMatchObject({ code: 'USER_REJECTED' })
  })

  it('needs a wallet for anything that sends a transaction', async () => {
    const { sdk, simulateContract } = setup({}, false)
    await expect(sdk.deliver(1n, WINNER)).rejects.toMatchObject({ code: 'NO_WALLET' })
    expect(simulateContract).not.toHaveBeenCalled()
  })

  it('still allows reading without a wallet', async () => {
    const { sdk } = setup({ read: () => view() }, false)
    await expect(sdk.getPurse(0n)).resolves.toMatchObject({ state: 'Open' })
  })

  it('flags a transaction that was mined but failed', async () => {
    const { sdk } = setup({ receipt: () => ({ status: 'reverted', logs: [] }) })
    await expect(sdk.sweep(1n)).rejects.toMatchObject({ code: 'TX_REVERTED' })
  })

  it('maps balance and network problems and keeps the original error on cause', () => {
    expect(toPurseError(new Error('transfer amount exceeds balance'))).toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
    const network = new Error('HTTP request failed: timeout')
    expect(toPurseError(network)).toMatchObject({ code: 'NETWORK', cause: network })
    expect(toPurseError('weird')).toMatchObject({ code: 'UNKNOWN' })
  })
})

describe('helpers', () => {
  it('converts USDC text to and from its smallest unit', () => {
    expect(parseUsdc('25.50')).toBe(25_500_000n)
    expect(formatUsdc(25_500_000n)).toBe('25.5')
  })

  it('derives the same states the app shows', () => {
    const base = { named: false, locked: false, nameBy: 100n, owed: 5n, winners: [] as { winner: `0x${string}`; amount: bigint; delivered: boolean }[] }
    expect(deriveState(base, 50n)).toBe('Open')
    expect(deriveState({ ...base, locked: true }, 50n)).toBe('Locked')
    expect(deriveState(base, 101n)).toBe('Refunds open')
    expect(deriveState({ ...base, owed: 0n }, 101n)).toBe('Returned')
    expect(deriveState({ ...base, named: true }, 101n)).toBe('Winners named')
    expect(deriveState({ ...base, named: true, owed: 0n, winners: [{ winner: WINNER, amount: 5n, delivered: true }] }, 101n)).toBe('Paid out')
  })
})
