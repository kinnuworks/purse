/**
 * Public app settings, read from Vite env vars with Arc mainnet defaults.
 * Nothing secret lives here: the demo wallet key is only ever read by api/demo.ts.
 */

const raw = import.meta.env as Record<string, string | undefined>

function text(key: string, fallback: string): string {
  const value = raw[key]?.trim()
  return value ? value : fallback
}

function whole(key: string, fallback: number): number {
  const value = Number(raw[key])
  return Number.isInteger(value) && value >= 0 && raw[key]?.trim() ? value : fallback
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export const CHAIN_ID = whole('VITE_CHAIN_ID', 5042)
export const RPC_URL = text('VITE_RPC_URL', 'https://rpc.mainnet.arc.io')
export const EXPLORER_URL = trimSlash(text('VITE_EXPLORER_URL', 'https://explorer.arc.io'))
export const USDC_ADDRESS = text('VITE_USDC_ADDRESS', '0x3600000000000000000000000000000000000000') as `0x${string}`

// arc-studio-allow-onchain-literal: the live Purse deployment on Arc mainnet, used when VITE_PURSE_ADDRESS is not set.
const LIVE_PURSE_ADDRESS = '0xC81332357d6832d5FDDd8eCDC884Ef4e461c422B'
/** The Purse contract. Defaults to the live Arc mainnet deployment; set VITE_PURSE_ADDRESS to point elsewhere. */
const purse = text('VITE_PURSE_ADDRESS', LIVE_PURSE_ADDRESS)
export const PURSE_ADDRESS: `0x${string}` | null = /^0x[0-9a-fA-F]{40}$/.test(purse) ? (purse as `0x${string}`) : null

/** First block to read logs from: the block the live contract was deployed in. Set VITE_DEPLOY_BLOCK when pointing at another contract. */
export const DEPLOY_BLOCK = BigInt(whole('VITE_DEPLOY_BLOCK', 29024415))
/** Blocks per log query. Kept small so public RPCs accept the request. */
export const LOG_RANGE = BigInt(Math.max(1, whole('VITE_LOG_RANGE', 2000)))

export const STUDIO_PROJECT_URL = 'https://studio.arc.io/app/4f1afe15-a898-46ff-9acf-196783f28e52'

/** Fixed demo limits, enforced in api/demo.ts and shown on the home page. */
export const DEMO_PRIZE_USDC = '0.01'

/** Sourcify's page for a verified contract. */
export const sourcifyUrl = (address: string, chainId: number = CHAIN_ID) => `https://repo.sourcify.dev/${chainId}/${address}`

export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
