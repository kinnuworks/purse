# purse-sdk

TypeScript SDK for Purse: contest prize pools that lock USDC in a contract before the contest starts. Built on [viem](https://viem.sh). It reads purses and sends the actions an organiser, funder or anyone needs. Not published to npm.

Built with [Arc Studio](https://studio.arc.io)

## Install

Not on npm. Install it from the GitHub repo (replace `OWNER/REPO` with the repository this folder lives in). The built files are committed in `dist/`, so there is no build step.

```
# pnpm can install a folder of a repo
pnpm add viem github:OWNER/REPO#path:/packages/purse-sdk

# npm and bun cannot install a sub-folder from GitHub; clone, then install from the folder
git clone https://github.com/OWNER/REPO.git
npm install viem ./REPO/packages/purse-sdk
```

`viem` v2 is a peer dependency.

## Example

```ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcMainnet, connectPurse, parseUsdc, PurseError } from 'purse-sdk'

const chain = {
  id: arcMainnet.chainId,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [arcMainnet.rpcUrl] } },
} as const

const account = privateKeyToAccount(process.env.PURSE_PRIVATE_KEY as `0x${string}`)
const purse = connectPurse({
  publicClient: createPublicClient({ chain, transport: http() }),
  walletClient: createWalletClient({ account, chain, transport: http() }),
  purse: arcMainnet.purse,
  usdc: arcMainnet.usdc,
})

try {
  const { id, hash } = await purse.createPurse({
    title: 'Best bug report',
    amount: parseUsdc('5'), // 5 USDC; approves first if needed
    nameBy: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    claimWindow: 3 * 24 * 3600, // seconds winners have to claim after being named
  })
  await purse.lock(id)
  await purse.nameWinners(id, [{ winner: '0x…', amount: parseUsdc('5') }])
  await purse.deliver(id, '0x…')
  console.log('Paid out purse', id, hash)
} catch (error) {
  if (error instanceof PurseError) console.error(error.code, error.message) // e.g. NOT_LOCKED
  else throw error
}
```

A complete script is in [`examples/agent-bounty.ts`](../../examples/agent-bounty.ts).

## What it does

| Function | What it does |
|---|---|
| `getPurse(id)` | Reads one purse with its winners and a plain state (Open, Locked, Winners named, Paid out, Returned, Refunds open). |
| `listPurses({ limit, offset })` | Reads purses, newest first. |
| `createPurse({ title, amount, nameBy, claimWindow })` | Creates and funds a purse. Sends a USDC approval first if the allowance is too low. |
| `lock(id)` | Ends funding. Needed before naming winners. |
| `nameWinners(id, [{ winner, amount }])` | Names the winners. Amounts must add up to exactly the pool. |
| `deliver(id, winner)` | Sends a winner their prize. Anyone can call it. |
| `refund(id, funder)` | Returns a funder's money when no winners were named in time. Anyone can call it. |
| `sweep(id)` | After the claim deadline, returns unclaimed prize money to the organiser. Anyone can call it. |

Amounts are USDC in its smallest unit (6 decimals). `parseUsdc("25.50")` gives `25_500_000n`; `formatUsdc` goes the other way.

Every write function simulates the call first, so a refusal is reported before any money moves, then waits for the transaction to be mined. It resolves to `{ hash, receipt }` (`createPurse` also returns `id`).

## Errors

Every failure is a `PurseError` with a stable `code`, a plain `message`, and the original error on `cause`. When the contract itself refused the call, `contractError` and `args` carry its own error name and arguments.

Common codes: `NOT_ORGANISER`, `NOT_LOCKED`, `FUNDING_LOCKED`, `ALREADY_NAMED`, `AMOUNTS_DO_NOT_MATCH_POOL`, `NAMING_CLOSED`, `CLAIM_WINDOW_CLOSED`, `CLAIM_WINDOW_OPEN`, `ALREADY_DELIVERED`, `NOT_A_WINNER`, `REFUND_NOT_AVAILABLE`, `NOTHING_TO_REFUND`, `NOTHING_TO_SWEEP`, plus `NO_WALLET`, `USER_REJECTED`, `INSUFFICIENT_FUNDS`, `NETWORK`, `TX_REVERTED` and `UNKNOWN`.

## Develop

```
bun run sdk:build   # rebuild dist/ (commit it)
bun run test        # runs the SDK tests with the rest
```
