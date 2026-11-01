# DoraHacks submission

**Name:** Purse
**Tagline:** Prize money you can see

**Description:**
Arc Studio took Purse from first contract to working app, and real USDC moves through it on Arc mainnet. Purse locks a hackathon, grant or bounty prize in a contract before the contest starts. The whole pool goes to the named winners, or back to whoever funded it.

Try it in 30 seconds with no wallet: paste any address into "Try it with a real cent" and it receives a real 0.01 USDC prize on mainnet, with each step linked to its transaction.

How Arc Studio was used: it wrote the contract, the 139 Foundry tests, the security passes, the app, the SDK and their 106 tests, and deployed to Arc testnet. The prompts are in the repo. I deployed to mainnet from my own wallet with arc-forge.

On mainnet, money has left the contract all three ways: delivered to winners, refunded to funders, and returned to the organiser when unclaimed. Most transactions so far come from my own wallets, and they're labelled on the proof page. The organiser still picks the winners, and the contract isn't audited.

**Arc Studio project:** https://studio.arc.io/app/4f1afe15-a898-46ff-9acf-196783f28e52
**Live app:** https://purse-arc.vercel.app
**Repo:** https://github.com/kinnuworks/purse
**Contract:** https://explorer.arc.io/address/0xc81332357d6832d5fddd8ecdc884ef4e461c422b
**Example transaction (a prize delivered):** https://explorer.arc.io/tx/0x35991382fde6e7010c5b58f383c64aeb651552912fddef72370a1b8786343eef
**Proof page:** https://purse-arc.vercel.app/proof
**For reviewers:** https://purse-arc.vercel.app/judges
**Try to break it:** https://purse-arc.vercel.app/break-it
**Video:** to be added
