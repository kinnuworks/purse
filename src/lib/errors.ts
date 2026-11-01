import { BaseError, decodeErrorResult, type Hex } from 'viem'
import { purseAbi } from './purse-abi'
import { isRateLimited } from './retry'

const BY_NAME: Record<string, string> = {
  UnknownPurse: 'That purse does not exist.',
  ZeroAddress: 'A wallet address cannot be empty or all zeros.',
  ZeroAmount: 'An amount must be more than zero.',
  InvalidDeadlines: 'The deadline to name winners has to be in the future.',
  ClaimWindowTooShort: 'The claim window is shorter than the minimum the contract allows.',
  NotOrganiser: 'Only the organiser of this purse can do that.',
  AlreadyNamed: 'Winners have already been named for this purse.',
  AlreadyLocked: 'This purse is already locked.',
  FundingIsLocked: 'This purse is locked, so no more money can be added.',
  NotLocked: 'Lock the purse first. Winners can only be named once funding is locked.',
  NamingClosed: 'The deadline to name winners has passed.',
  LengthMismatch: 'Each winner needs exactly one amount.',
  InvalidWinnerCount: 'A purse needs between 1 and 50 winners.',
  DuplicateWinner: 'The same wallet is listed as a winner twice.',
  AmountsDoNotMatchPool: 'The prize amounts must add up to exactly the pool.',
  NotNamed: 'Winners have not been named yet.',
  ClaimWindowClosed: 'The claim window has closed. Unclaimed prizes go back to the organiser.',
  NotAWinner: 'That wallet is not a winner in this purse.',
  AlreadyDelivered: 'That prize has already been delivered.',
  RefundNotAvailable: 'Refunds open only after the naming deadline passes with no winners named.',
  NothingToRefund: 'There is nothing left to return to that funder.',
  ClaimWindowOpen: 'Winners are still inside their claim window.',
  NothingToSweep: 'There is no unclaimed prize money to return.',
  ReentrancyGuardReentrantCall: 'The contract refused a repeated call.',
  SafeERC20FailedOperation: 'The USDC transfer was refused. The wallet involved may be blocked from receiving USDC.',
}

function findRevertData(error: unknown): Hex | null {
  if (error instanceof BaseError) {
    const found = error.walk((e) => typeof (e as { data?: unknown }).data === 'string' && /^0x[0-9a-fA-F]{8,}/.test((e as { data: string }).data))
    const data = (found as { data?: unknown } | null)?.data
    if (typeof data === 'string') return data as Hex
  }
  return null
}

/** Turns anything thrown by a wallet, the RPC or the contract into one plain sentence. */
export function plainError(error: unknown): string {
  const data = findRevertData(error)
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: purseAbi, data })
      if (BY_NAME[decoded.errorName]) return BY_NAME[decoded.errorName]
    } catch {
      // Not one of ours; fall through to the text checks.
    }
  }
  const text = (error instanceof Error ? `${error.message} ${(error as { shortMessage?: string }).shortMessage ?? ''}` : String(error)).toLowerCase()
  const code = (error as { code?: unknown } | null)?.code
  if (code === 4001 || /user rejected|user denied|rejected the request/.test(text)) return 'You cancelled the request in your wallet.'
  if (/exceeds allowance|insufficient allowance/.test(text)) return 'The purse is not allowed to take that much USDC yet. Approve it first.'
  if (/exceeds balance|insufficient funds|insufficient balance/.test(text)) return 'Your wallet does not hold enough USDC (or enough to pay the network fee).'
  if (/blacklist|blocklist|blocked/.test(text)) return 'USDC refused the transfer. A wallet involved may be blocked from using USDC.'
  if (isRateLimited(error)) return 'The network is busy right now. Wait a few seconds and try again.'
  if (/chain mismatch|does not match the target chain|switch/.test(text)) return 'Your wallet is on a different network. Switch to Arc and try again.'
  if (/fetch|network|timeout|timed out|failed to|http request/.test(text)) return 'Could not reach the network. Check your connection and try again.'
  if (/reverted/.test(text)) return 'The contract refused this action. Refresh the page and check that it is still allowed.'
  return 'Something went wrong. Refresh the page and try again.'
}
