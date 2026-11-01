Now the app: a Vite and React app in this project, reading the Purse contract with viem. No backend database; every figure comes from contract reads and event logs. Read the contract address, USDC address, chain id, RPC URL and explorer URL from environment variables with these Arc mainnet defaults: chain 5042, RPC https://rpc.mainnet.arc.io, explorer https://explorer.arc.io, USDC 0x3600000000000000000000000000000000000000 (6 decimals). Log queries must work in small block ranges with retry on 429, starting from a deploy block set by env, and cache in localStorage.

Screens, all readable with no wallet:

1. Home, at `/`. The first thing on screen is a real purse from chain: its title, the amount in large type, "Locked", the deadline to name winners, and a link to the contract on the explorer. Headline: "Prize money you can see." One line under it: "Lock the prize before the contest. The whole pool goes to the winners, or back to whoever funded it." Below that, the "Try it with a real cent" panel, then a list of every purse with its state: Open, Locked, Winners named, Paid out, Returned.

2. Purse page, at `/p/:id`. Pool, funders with amounts, deadlines, winners with amount and delivered state, and a dated history of every event with a transaction link. If the organiser is also a winner, or also the only funder, show a plain note saying so. Add a line: "Purse proves the money is there and where it went. It can't prove the judging was fair." Winners and funders each get a button that calls `deliver` or `refund` when it's available; anyone can press them.

3. Create page, at `/new`. Connect an injected wallet, switch to chain 5042 if needed, then title, amount, name-by date and claim window, with approve and create as two clear steps. On the purse page, the organiser sees add-winners and lock controls, with the running total against the pool and a clear message until they match.

Show raw errors in plain words, and show loading states rather than empty ones.

"Try it with a real cent" panel: an optional input for an Arc address and a button, "Run a real prize". It posts to `/api/demo`, a Vercel serverless function in `api/demo.ts` that signs with a demo wallet whose key is in the env var `DEMO_PRIVATE_KEY`, never exposed to the client. It runs create, lock, name and deliver on mainnet: a 0.01 USDC prize with the given address as the winner, or the demo wallet's own second address if none was given. Stream each step and its transaction hash to the page as it lands, with explorer links. Limits enforced in the function from chain state, so no database is needed: at most one run every 60 seconds, a daily limit of 50, one run per winner address, and stop with a friendly message if the demo wallet holds less than 0.20 USDC. Titles are fixed ("Demo purse"), never user text. If the function is unavailable, the panel shows the latest finished demo purse instead.

Also add `/proof`: contract address, Studio project link https://studio.arc.io/app/4f1afe15-a898-46ff-9acf-196783f28e52, test count, and a table of transactions read from a JSON file `src/proof.json` that I'll fill in, labelled by who sent them.

Keep the design calm: white page, one dark ink colour, one green for locked or paid, tabular numbers for money, works on a phone. No marketing sections and no invented numbers. Every number on screen must be read from chain, or be the prize limits above.

Add a test for the demo function's limits and for the log-reading code. Run the build and the tests, and fix anything that fails. Tell me what you couldn't test without a deployed contract.
