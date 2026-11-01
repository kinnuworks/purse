# Purse

**Prize money you can see.** Purse locks a hackathon, grant or bounty prize in a contract before the contest starts. The whole pool goes to the named winners, or back to whoever funded it.

**Live app:** https://purse-arc.vercel.app (no wallet needed to read anything)

**Try it in 30 seconds:** paste any wallet address into "Try it with a real cent" and press the button. The app runs a real 0.01 USDC prize on Arc mainnet and that address receives it. Each step links to its transaction.

**Why Arc:** prizes are priced in dollars and gas is paid in USDC, so a 0.01 USDC prize is practical. Anyone can deliver a prize, so a winner needs no gas or USDC to receive one.

**Proof:**
- Contract on Arc mainnet: [`0xc81332357d6832d5fddd8ecdc884ef4e461c422b`](https://explorer.arc.io/address/0xc81332357d6832d5fddd8ecdc884ef4e461c422b), verified on Sourcify (exact match)
- Every mainnet transaction, labelled by who sent it: [/proof](https://purse-arc.vercel.app/proof) and [`ops/txs.tsv`](ops/txs.tsv)
- Money has left the contract all three ways on mainnet: delivered to winners, refunded to funders, and returned to the organiser when unclaimed
- Built in Arc Studio, contracts, tests and app: [project](https://studio.arc.io/app/4f1afe15-a898-46ff-9acf-196783f28e52). The prompts are in `brief-*.md`. Studio deployed to testnet; mainnet was deployed from my own wallet with `arc-forge`, because Studio doesn't touch mainnet.
- 139 Foundry tests and 53 app tests

**What it doesn't prove:** the organiser still picks the winners, so Purse shows the money is there and where it went, not that the judging was fair. The contract has not been audited, has no admin and can't be upgraded. Keep amounts small.

**Honest usage note:** most mainnet transactions so far come from my own wallets, and they're labelled that way.

## What it does

- Anyone can read every purse, its pool, funders, winners and a dated history, with no wallet.
- Organisers connect a browser wallet to create a purse, lock it and name winners.
- Anyone can deliver a prize to a winner or return a funder's money when it is due.
- A "Try it with a real cent" panel runs a real 0.01 USDC prize from a demo wallet.
- A proof page lists the contract, the tests and the transactions that show it working.

## Tech stack

- Solidity 0.8.28, OpenZeppelin, Foundry (contract, tests, deploy script)
- Vite, React, TypeScript, Tailwind, viem and wagmi
- A Vercel serverless function for the demo (`api/demo.ts`)
- Vitest for the app tests

## Development

Prerequisites: [Foundry](https://book.getfoundry.sh/) and [Bun](https://bun.sh/).

```
bun install
bun run dev        # start the app
bun run build      # production build
bun run test       # app tests (log reading, demo limits, purse rules)
bun run check      # lint and typecheck
forge test         # contract tests
```

Deploy the contract to any network from your own wallet:

```
USDC_ADDRESS=0x... forge script contracts/script/Deploy.s.sol:DeployPurse --rpc-url <rpc-url> --account <keystore-name> --broadcast
```

To use your own deployment, set `VITE_PURSE_ADDRESS` and `VITE_DEPLOY_BLOCK` (the block it was deployed in). `env.example` lists every setting. `.npmrc` sets `legacy-peer-deps=true` for hosts that install with npm.

### Environment variables

Public (read by the browser and the demo function; all optional, with the live Arc mainnet deployment as the default):

- `VITE_PURSE_ADDRESS`: the Purse contract. Defaults to the live Arc mainnet deployment.
- `VITE_DEPLOY_BLOCK`: first block to read history from. Defaults to the block the live contract was deployed in; set it when you point at another contract.
- `VITE_CHAIN_ID`: defaults to 5042 (Arc mainnet).
- `VITE_RPC_URL`: defaults to https://rpc.mainnet.arc.io.
- `VITE_EXPLORER_URL`: defaults to https://explorer.arc.io.
- `VITE_USDC_ADDRESS`: the USDC token, 6 decimals. Defaults to the Arc USDC address.
- `VITE_LOG_RANGE`: blocks per history query. Defaults to 2000.

Server only (set in the hosting project, never in the browser):

- `DEMO_PRIVATE_KEY`: key of the demo wallet used by `api/demo.ts`. It must hold USDC on the chain above. The demo stops below 0.20 USDC.

### Proof page

Add the transactions you want to show to `src/proof.json`. Each entry has `sender` (who sent it, in words), `what` and `hash`; add `"network": "testnet"` to mark an Arc Testnet rehearsal, and `testnetContract` for its contract address.
