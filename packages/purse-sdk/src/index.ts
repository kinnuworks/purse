// arc-studio-allow-onchain-literal: the live Purse deployment and Arc mainnet USDC, offered as a ready-made setting.
export { connectPurse, deriveState, formatUsdc, parseUsdc, type PurseClient } from './client.js'
export { PurseError, isPurseError, toPurseError, type PurseErrorCode } from './errors.js'
export { purseAbi } from './abi.js'
export type { Address, CreateInput, CreateResult, Purse, PurseConfig, PurseState, TxResult, Winner, WinnerInput } from './types.js'

/** The live Purse contract on Arc mainnet. Spread it into `connectPurse` with your own clients. */
export const arcMainnet = {
  chainId: 5042,
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  purse: '0xC81332357d6832d5FDDd8eCDC884Ef4e461c422B',
  usdc: '0x3600000000000000000000000000000000000000',
  /** First block with Purse events. */
  deployBlock: 29024415n,
} as const
