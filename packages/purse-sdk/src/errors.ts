import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from 'viem'
import { purseAbi } from './abi.js'

/** Every way an SDK call can fail, as a short stable code you can switch on. */
export type PurseErrorCode =
  // Setup and wallet
  | 'NO_WALLET'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'NETWORK'
  | 'TX_REVERTED'
  | 'UNKNOWN'
  // The contract's own refusals
  | 'UNKNOWN_PURSE'
  | 'ZERO_ADDRESS'
  | 'ZERO_AMOUNT'
  | 'INVALID_DEADLINES'
  | 'CLAIM_WINDOW_TOO_SHORT'
  | 'NOT_ORGANISER'
  | 'ALREADY_NAMED'
  | 'ALREADY_LOCKED'
  | 'FUNDING_LOCKED'
  | 'NOT_LOCKED'
  | 'NAMING_CLOSED'
  | 'INVALID_WINNERS'
  | 'DUPLICATE_WINNER'
  | 'AMOUNTS_DO_NOT_MATCH_POOL'
  | 'NOT_NAMED'
  | 'CLAIM_WINDOW_CLOSED'
  | 'NOT_A_WINNER'
  | 'ALREADY_DELIVERED'
  | 'REFUND_NOT_AVAILABLE'
  | 'NOTHING_TO_REFUND'
  | 'CLAIM_WINDOW_OPEN'
  | 'NOTHING_TO_SWEEP'
  | 'TRANSFER_REFUSED'

const FROM_CONTRACT: Record<string, { code: PurseErrorCode; message: string }> = {
  UnknownPurse: { code: 'UNKNOWN_PURSE', message: 'That purse does not exist.' },
  ZeroAddress: { code: 'ZERO_ADDRESS', message: 'A wallet address cannot be empty or all zeros.' },
  ZeroAmount: { code: 'ZERO_AMOUNT', message: 'An amount must be more than zero.' },
  InvalidDeadlines: { code: 'INVALID_DEADLINES', message: 'The deadline to name winners has to be in the future.' },
  ClaimWindowTooShort: { code: 'CLAIM_WINDOW_TOO_SHORT', message: 'The claim window is shorter than the minimum the contract allows.' },
  NotOrganiser: { code: 'NOT_ORGANISER', message: 'Only the organiser of this purse can do that.' },
  AlreadyNamed: { code: 'ALREADY_NAMED', message: 'Winners have already been named for this purse.' },
  AlreadyLocked: { code: 'ALREADY_LOCKED', message: 'This purse is already locked.' },
  FundingIsLocked: { code: 'FUNDING_LOCKED', message: 'This purse is locked, so no more money can be added.' },
  NotLocked: { code: 'NOT_LOCKED', message: 'Lock the purse first. Winners can only be named once funding is locked.' },
  NamingClosed: { code: 'NAMING_CLOSED', message: 'The deadline to name winners has passed.' },
  LengthMismatch: { code: 'INVALID_WINNERS', message: 'Each winner needs exactly one amount.' },
  InvalidWinnerCount: { code: 'INVALID_WINNERS', message: 'A purse needs between 1 and 50 winners.' },
  DuplicateWinner: { code: 'DUPLICATE_WINNER', message: 'The same wallet is listed as a winner twice.' },
  AmountsDoNotMatchPool: { code: 'AMOUNTS_DO_NOT_MATCH_POOL', message: 'The prize amounts must add up to exactly the pool.' },
  NotNamed: { code: 'NOT_NAMED', message: 'Winners have not been named yet.' },
  ClaimWindowClosed: { code: 'CLAIM_WINDOW_CLOSED', message: 'The claim window has closed. Unclaimed prizes go back to the organiser.' },
  NotAWinner: { code: 'NOT_A_WINNER', message: 'That wallet is not a winner in this purse.' },
  AlreadyDelivered: { code: 'ALREADY_DELIVERED', message: 'That prize has already been delivered.' },
  RefundNotAvailable: { code: 'REFUND_NOT_AVAILABLE', message: 'Refunds open only after the naming deadline passes with no winners named.' },
  NothingToRefund: { code: 'NOTHING_TO_REFUND', message: 'There is nothing left to return to that funder.' },
  ClaimWindowOpen: { code: 'CLAIM_WINDOW_OPEN', message: 'Winners are still inside their claim window.' },
  NothingToSweep: { code: 'NOTHING_TO_SWEEP', message: 'There is no unclaimed prize money to return.' },
  SafeERC20FailedOperation: { code: 'TRANSFER_REFUSED', message: 'The USDC transfer was refused. A wallet involved may be blocked from using USDC.' },
}

/** A plain, typed error. `code` is stable; `message` is a sentence you can show a person. */
export class PurseError extends Error {
  readonly code: PurseErrorCode
  /** The contract's own error name when the contract refused the call, for example "NotOrganiser". */
  readonly contractError?: string
  /** The contract error's arguments, if any. */
  readonly args?: readonly unknown[]
  readonly cause?: unknown

  constructor(code: PurseErrorCode, message: string, details: { contractError?: string; args?: readonly unknown[]; cause?: unknown } = {}) {
    super(message)
    this.name = 'PurseError'
    this.code = code
    this.contractError = details.contractError
    this.args = details.args
    this.cause = details.cause
  }
}

export const isPurseError = (error: unknown): error is PurseError => error instanceof PurseError

function revertFrom(error: unknown): { name: string; args: readonly unknown[] } | null {
  if (!(error instanceof BaseError)) return null
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (reverted instanceof ContractFunctionRevertedError) {
    if (reverted.data) return { name: reverted.data.errorName, args: reverted.data.args ?? [] }
    if (reverted.raw) {
      try {
        const decoded = decodeErrorResult({ abi: purseAbi, data: reverted.raw })
        return { name: decoded.errorName, args: (decoded.args ?? []) as readonly unknown[] }
      } catch {
        return null
      }
    }
  }
  return null
}

/** Turns anything thrown by viem or a wallet into a PurseError. */
export function toPurseError(error: unknown): PurseError {
  if (error instanceof PurseError) return error

  const revert = revertFrom(error)
  if (revert) {
    const known = FROM_CONTRACT[revert.name]
    if (known) return new PurseError(known.code, known.message, { contractError: revert.name, args: revert.args, cause: error })
    return new PurseError('TX_REVERTED', `The contract refused this action (${revert.name}).`, { contractError: revert.name, args: revert.args, cause: error })
  }

  const text = (error instanceof Error ? `${error.message} ${(error as { shortMessage?: string }).shortMessage ?? ''}` : String(error)).toLowerCase()
  const code = (error as { code?: unknown } | null)?.code
  if (code === 4001 || /user rejected|user denied|rejected the request/.test(text)) {
    return new PurseError('USER_REJECTED', 'The request was cancelled in the wallet.', { cause: error })
  }
  if (/exceeds balance|insufficient funds|insufficient balance/.test(text)) {
    return new PurseError('INSUFFICIENT_FUNDS', 'The wallet does not hold enough USDC, or not enough to pay the network fee.', { cause: error })
  }
  if (/fetch|network|timeout|timed out|http request|rate.?limit|429/.test(text)) {
    return new PurseError('NETWORK', 'Could not reach the network. Try again in a moment.', { cause: error })
  }
  return new PurseError('UNKNOWN', 'Something went wrong. The original error is on `cause`.', { cause: error })
}
