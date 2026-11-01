Two small things, no change to Purse.sol or any existing number.

1. On /judges add a section, "How this was built in Arc Studio". List the prompts in order, read from the brief-*.md files in the repo (link each file at https://github.com/kinnuworks/purse/blob/main/<file>), with one plain line each on what Studio produced from it. Facts only, taken from the files. Say that Studio wrote the contract, tests, app and SDK and deployed to Arc testnet, and that mainnet was deployed from the builder's wallet with arc-forge because Studio doesn't touch mainnet.

2. On /break-it, the rows that said "not run" should now find a suitable purse: purse 8 is locked and inside its naming deadline. Check every row can run, and show the real result. Don't fake any.

Run tests and the build.
