# Submission text

**Name:** Purse
**Tagline:** Prize money you can see

**Description:**
Arc Studio took Purse from first contract to working app, and real USDC moves through it on Arc mainnet. Purse locks a hackathon, grant or bounty prize in a contract before the contest starts. The whole pool has to go to the named winners. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to the organiser.

Try it in 30 seconds with no wallet: paste any address into "Try it with a real cent" and it receives a real 0.01 USDC prize on mainnet, with each step linked to its transaction.

How Arc Studio was used: it wrote the contract, the 139 Foundry tests, the security passes, the app, the SDK and their 114 tests, and deployed to Arc testnet. The prompts are in the repo. I deployed to mainnet from my own wallet with arc-forge.

On mainnet, money has left the contract all three ways: delivered to winners, refunded to funders, and returned to the organiser when unclaimed. The launch prize paid 0.50 USDC each to two people I know personally, friends and family. One's feedback led to a redesign, and both addresses also received a real-cent demo prize. Most other transactions come from my own wallets, and they're labelled on the proof page. The organiser still picks the winners, and the contract isn't audited.

**Arc Studio project:** https://studio.arc.io/app/4f1afe15-a898-46ff-9acf-196783f28e52
**Live app:** https://purse-arc.vercel.app
**Repo:** https://github.com/kinnuworks/purse
**Contract:** https://explorer.arc.io/address/0xc81332357d6832d5fddd8ecdc884ef4e461c422b
**Example transaction (0.50 USDC delivered to a winner):** https://explorer.arc.io/tx/0xdf06cc5bae9369edcb35d15cc93161f2eef923052f0303bd185bdd522d22827f
**Proof page:** https://purse-arc.vercel.app/proof
**For reviewers:** https://purse-arc.vercel.app/judges
**Try to break it:** https://purse-arc.vercel.app/break-it
**Video:** to be added
