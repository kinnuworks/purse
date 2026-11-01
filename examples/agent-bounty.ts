/**
 * An agent posts a small bounty, looks at the open bounties, names a winner and pays them.
 * Prints each transaction hash as it lands.
 *
 *   PURSE_PRIVATE_KEY=0x… WINNER_ADDRESS=0x… bun run examples/agent-bounty.ts
 *
 * Settings (all from the environment):
 *   PURSE_PRIVATE_KEY  required. The wallet that posts the bounty and pays for gas. It needs USDC.
 *   WINNER_ADDRESS     required. Who wins the bounty.
 *   BOUNTY_USDC        optional. Prize size, default 0.05.
 *   PURSE_ADDRESS, USDC_ADDRESS, RPC_URL, CHAIN_ID, EXPLORER_URL   optional. Default to the live Arc mainnet deployment,
 *                      so on a default run this spends real USDC. Point them at a test network to rehearse first.
 *
 * Inside this repo it imports the SDK from source. In your own project, import from "purse-sdk" instead.
 */
// arc-studio-allow-onchain-literal: example reads its settings from the environment; the SDK preset supplies the defaults.

import { createPublicClient, createWalletClient, http, isAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcMainnet, connectPurse, formatUsdc, isPurseError, parseUsdc } from '../packages/purse-sdk/src/index.ts'

const env = process.env
const key = env.PURSE_PRIVATE_KEY
const winner = env.WINNER_ADDRESS
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Set PURSE_PRIVATE_KEY to a 0x… private key.')
if (!winner || !isAddress(winner)) throw new Error('Set WINNER_ADDRESS to the wallet that should win the bounty.')

const rpcUrl = env.RPC_URL ?? arcMainnet.rpcUrl
const explorer = (env.EXPLORER_URL ?? arcMainnet.explorerUrl).replace(/\/+$/, '')
const chain = {
  id: Number(env.CHAIN_ID ?? arcMainnet.chainId),
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
} as const

const account = privateKeyToAccount(key as Hex)
const purse = connectPurse({
  publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
  walletClient: createWalletClient({ account, chain, transport: http(rpcUrl) }),
  purse: (env.PURSE_ADDRESS ?? arcMainnet.purse) as `0x${string}`,
  usdc: (env.USDC_ADDRESS ?? arcMainnet.usdc) as `0x${string}`,
})

const show = (step: string, hash: string) => console.log(`${step.padEnd(9)} ${hash}  ${explorer}/tx/${hash}`)

try {
  const amount = parseUsdc(env.BOUNTY_USDC ?? '0.05')
  console.log(`Posting a ${formatUsdc(amount)} USDC bounty from ${account.address}`)

  // 1. Post the bounty. The SDK approves USDC first if it has to.
  const created = await purse.createPurse({
    title: 'Bounty: agent example',
    amount,
    nameBy: new Date(Date.now() + 60 * 60 * 1000),
    claimWindow: 60 * 60,
  })
  if (created.approvalHash) show('approve', created.approvalHash)
  show('create', created.hash)

  // 2. Lock it so nobody can change the pool while the winner is chosen.
  show('lock', (await purse.lock(created.id)).hash)

  // 3. Read the open bounties, as another agent looking for work would.
  const open = (await purse.listPurses({ limit: 20 })).filter((p) => p.title.startsWith('Bounty:') && (p.state === 'Open' || p.state === 'Locked'))
  console.log(`Open bounties (${open.length}):`)
  for (const p of open) console.log(`  #${p.id}  ${p.title}  ${formatUsdc(p.pool)} USDC  ${p.state}`)

  // 4. Name the winner for the whole pool, then deliver the prize.
  show('name', (await purse.nameWinners(created.id, [{ winner, amount }])).hash)
  show('deliver', (await purse.deliver(created.id, winner)).hash)

  const done = await purse.getPurse(created.id)
  console.log(`Purse #${done.id} is now: ${done.state}`)
} catch (error) {
  if (isPurseError(error)) {
    console.error(`Stopped: ${error.message} (${error.code})`)
    process.exitCode = 1
  } else {
    throw error
  }
}
