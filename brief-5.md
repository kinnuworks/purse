Three fixes from checking the live site. Use the attached src/proof.json and README.md as they are; I've filled them in.

1. Home's first purse: prefer the newest purse still holding money (Open or Locked), whose title doesn't start with "Test:" or equal "Demo purse". Fall back to the newest other purse. In the list, group titles starting with "Test:" with the demo runs under a small "Test and demo runs" label.
2. A refunded purse shows "0.00 USDC", because its pool drops to zero after refunds. On cards and on the purse page, show the most money it ever held, worked out from the Funded events, and say "returned" with that amount.
3. The purse-page line "The organiser is the only funder" is fine, but on the home card change "The pool for this purse, read from the contract." to "Read from the contract just now."

Rerun the tests and the build.
