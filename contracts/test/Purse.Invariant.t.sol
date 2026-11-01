// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {Purse} from "../Purse.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {PurseHandler, PurseDonorHandler} from "./Purse.Handler.sol";

/// @dev Shared setup + per-purse/lifecycle invariants. Concrete suites choose the handler.
abstract contract PurseInvariantBase is Test {
    Purse internal purse;
    MockUSDC internal usdc;
    PurseHandler internal handler;

    function _deployCore() internal {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        purse = new Purse(address(usdc));
    }

    function _sumOwed() internal view returns (uint256 sum) {
        uint256 count = purse.purseCount();
        for (uint256 id = 0; id < count; ++id) {
            sum += purse.purse(id).owed;
        }
    }

    /// PROPERTY: balance == everything pulled in via create/add, minus paid out, plus donated.
    function invariant_BalanceMatchesGhostLedger() public view {
        assertEq(
            usdc.balanceOf(address(purse)),
            handler.ghostIn() + handler.ghostDonated() - handler.ghostOut(),
            "balance != ledger"
        );
    }

    function invariant_PurseCountMatchesCreates() public view {
        assertEq(purse.purseCount(), handler.nCreate());
    }

    /// PROPERTY (per purse): owed never exceeds pool; pool == sum of recorded contributions;
    /// unnamed => owed == pool, claimBy == 0; named => locked, winners sum to pool,
    /// claimBy == naming time + claimWindow, owed == pool - delivered (or 0 once swept);
    /// locked pools never grow after the lock and are frozen once named.
    function invariant_PerPurseAccounting() public view {
        address[] memory funders = handler.funders();
        uint256 count = purse.purseCount();
        for (uint256 id = 0; id < count; ++id) {
            Purse.PurseView memory v = purse.purse(id);
            assertLe(v.owed, v.pool, "owed > pool");
            assertGe(v.claimWindow, 60, "claimWindow < MIN");

            uint256 contribSum;
            for (uint256 i = 0; i < funders.length; ++i) {
                contribSum += purse.contributionOf(id, funders[i]);
            }
            assertEq(contribSum, v.pool, "pool != sum contributions");

            if (v.locked) {
                assertTrue(handler.everLocked(id), "locked without a successful lock()");
                assertLe(v.pool, handler.poolAtLock(id), "pool grew after lock");
            }

            if (!v.named) {
                assertEq(v.owed, v.pool, "unnamed: owed != pool");
                assertEq(v.winnerCount, 0);
                assertEq(v.claimBy, 0, "unnamed: claimBy set");
            } else {
                assertTrue(v.locked, "named but not locked");
                assertEq(v.pool, handler.poolAtLock(id), "named pool != locked pool");
                assertEq(v.claimBy, handler.namedAt(id) + v.claimWindow, "claimBy != named + window");
                Purse.Winner[] memory ws = purse.winnersOf(id);
                assertEq(ws.length, v.winnerCount);
                uint256 total;
                uint256 delivered;
                for (uint256 i = 0; i < ws.length; ++i) {
                    total += ws[i].amount;
                    if (ws[i].delivered) delivered += ws[i].amount;
                }
                assertEq(total, v.pool, "winners != pool");
                if (handler.swept(id)) {
                    assertEq(v.owed, 0, "swept but owed");
                } else {
                    assertEq(v.owed, v.pool - delivered, "owed != pool - delivered");
                }
            }
        }
    }

    /// Informational: confirms the handler actually reaches each state-changing path.
    function invariant_CallSummary() public view {
        console2.log("create/add/lock", handler.nCreate(), handler.nAdd());
        console2.log("lock/name", handler.nLock(), handler.nName());
        console2.log("deliver/refund/sweep", handler.nDeliver(), handler.nRefund());
        console2.log("sweep/donated", handler.nSweep(), handler.ghostDonated());
    }
}

/// Handler ALSO sends USDC directly to the Purse at random.
contract PurseInvariantTest is PurseInvariantBase {
    function setUp() public {
        _deployCore();
        handler = new PurseDonorHandler(purse, usdc);
        targetContract(address(handler));
    }

    /// PROPERTY: the contract always holds at least what it owes, even with stray donations.
    function invariant_BalanceCoversSumOwed() public view {
        assertGe(usdc.balanceOf(address(purse)), _sumOwed(), "balance < sum owed");
    }

    /// PROPERTY: the surplus over obligations is exactly the donated total (donations are inert).
    function invariant_SurplusEqualsDonations() public view {
        assertEq(usdc.balanceOf(address(purse)) - _sumOwed(), handler.ghostDonated(), "surplus != donations");
    }
}

/// Handler NEVER donates.
contract PurseNoDonationInvariantTest is PurseInvariantBase {
    function setUp() public {
        _deployCore();
        handler = new PurseHandler(purse, usdc);
        targetContract(address(handler));
    }

    /// PROPERTY: with no stray donations, USDC held == sum of owed over every purse, exactly.
    function invariant_BalanceEqualsSumOwed() public view {
        assertEq(usdc.balanceOf(address(purse)), _sumOwed(), "balance != sum owed");
        assertEq(handler.ghostDonated(), 0);
    }
}
