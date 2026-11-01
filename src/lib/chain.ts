import { createPublicClient, defineChain, http } from 'viem'
import { CHAIN_ID, EXPLORER_URL, RPC_URL } from './env'

/** Arc: USDC is the gas token (18 decimals native view). Balances and amounts in this app use the 6-decimal ERC-20 view. */
export const purseChain = defineChain({
  id: CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: EXPLORER_URL } },
})

export const publicClient = createPublicClient({
  chain: purseChain,
  transport: http(RPC_URL, { retryCount: 1 }),
})
