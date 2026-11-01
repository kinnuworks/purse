I'm not creating an API key, so skip every onchain step this turn: no testnet deploy and no purse creation. I'll deploy from my own wallet with the scripts in this project.

Three changes to Purse.sol from a review. Update the tests to match, and rerun the security pass and all tests.

1. Griefing on naming. Right now someone can add a tiny amount just before `name`, so the amounts no longer add up and the call reverts. Add `lock(uint256 id)`, organiser only, which ends funding for that purse. `add` reverts once locked. `name` requires the purse to be locked, and the amounts must add up to exactly the pool. `name` may lock in the same call if it isn't locked yet, only if that keeps griefing impossible; otherwise keep the two calls separate.

2. Late naming. An absolute `claimBy` lets an organiser name winners at the last moment and leave them almost no time. Replace `claimBy` with `claimWindow` in seconds, set at `create`, with a minimum of 60 seconds. The real deadline is the time of naming plus `claimWindow`. `sweep` uses that deadline. `create` must still reject a `nameBy` that isn't in the future.

3. Stray USDC. Use internal accounting only, never `balanceOf`, for what is owed. Change the invariant to: contract balance is at least the sum still owed, and it equals that sum when nobody has sent USDC directly. Add a test that sends USDC straight to the contract and shows no purse is affected.

Also add a Foundry script `contracts/script/Deploy.s.sol` that takes the USDC address from an environment variable and deploys Purse, so it works with `forge script` on any network. Tell me the final test count and the contract's public function list.
