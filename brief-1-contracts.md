Build Purse: prize money anyone can see. Hackathons, grants and bounties promise money up front and winners have to trust that it exists. Purse locks the money in a contract before the contest starts.

This turn: the contract and its tests only, then deploy to Arc testnet. The app comes in the next turn.

Contract `Purse.sol`, one contract holding many purses, using USDC (ERC-20 view, 6 decimals) passed as an immutable constructor argument. No owner, no admin, no fee, no upgrade, no pause.

- `create(string title, uint256 amount, uint64 nameBy, uint64 claimBy)`: pulls `amount` USDC from the organiser. `nameBy` must be in the future and `claimBy` must be after `nameBy`. Returns an id.
- `add(uint256 id, uint256 amount)`: anyone can add funds before winners are named. Track each funder's contribution.
- `name(uint256 id, address[] winners, uint256[] amounts)`: organiser only, once only, at or before `nameBy`. The amounts must add up to exactly the whole pool, so the organiser can't quietly keep part of it. Reject zero addresses, zero amounts, duplicates, and more than 50 winners.
- `deliver(uint256 id, address winner)`: anyone can call it, and it sends that winner their prize, so a winner needs no gas and no USDC. Only before `claimBy`.
- `refund(uint256 id, address funder)`: anyone can call it. If `nameBy` has passed with no winners named, that funder gets their own contribution back.
- `sweep(uint256 id)`: anyone can call it. After `claimBy`, undelivered prize money goes back to the organiser.

One failed transfer must never block other winners or funders. Use checks-effects-interactions and a reentrancy guard. Emit an event for every state change, with enough fields for an app to rebuild the whole history from logs alone. Add view functions: `purse(id)` and `winnersOf(id)` returning each winner, amount and delivered flag, plus `purseCount()`.

Foundry tests must cover: the full happy path; a sponsor adding funds; amounts not adding up; naming twice; naming late; a non-organiser naming; delivering twice; delivering after `claimBy`; refund when no winners were named, for several funders; refund blocked once winners are named; sweep before and after `claimBy`; a recipient that can't receive; a fuzz test on amounts; and an invariant that the contract's USDC balance always equals the sum of money still owed across all purses.

Run the tests, show me the results, and fix anything that fails. Then deploy to Arc testnet and create one purse there, so the flow is proved with a real transaction.
