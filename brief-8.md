A hostile review found these. Fix all of them; no change to Purse.sol. Keep src/proof.json and README.md as attached.

1. /judges rendered blank when `ourAddresses` held a bare string. Make the reader accept both a string and an {address,label} object, and add a render test for /judges and /proof that fails on a crash. Add an error boundary so a bad data entry can never blank a page.
2. The site overpromises. Wherever it says the pool goes "back to whoever funded it", say exactly what's true: "The whole pool has to go to the named winners. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to the organiser." On each purse page with more than one funder and winners named, add a plain note that any unclaimed prize returns to the organiser, not to the sponsors. Show the claim window in plain words, and flag it if it's under a day.
3. On /break-it add a section under the attacks, "What Purse can't stop", plainly listing: the organiser can name themselves as winner (the purse page flags it); the organiser can set a claim window as short as 60 seconds, then return an undelivered prize to themselves; money a sponsor added goes with it; anyone can deliver, so a short window is only a risk if nobody delivers in time. Link the real example, purse 3.
4. Home's first purse should be the largest paid or open purse whose title doesn't start with "Test:", "Bounty:" or equal "Demo purse". Group "Bounty:" titles with the test and demo runs.
5. "Rehearsal" wording: rename any "testnet rehearsal" text to "testnet run"; it came after the mainnet deploy.
6. On /judges add one honest line under the counts: "Everything so far is small and mostly our own wallets. The two launch-prize winners are people I know personally." Don't quote anyone except the design feedback that's already there.

Run all tests and the build.
