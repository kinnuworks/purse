// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// deliver / refund / sweep, blocklisted recipients, stray donations.
contract PursePayoutTest is PurseTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create(POOL);
    }

    function _organiserBalAfterFunding() internal pure returns (uint256) {
        return 100_000e6 - POOL;
    }

    // ───────────── deliver ─────────────
    function test_Deliver_BeforeNamingReverts() public {
        vm.expectRevert(Purse.NotNamed.selector);
        purse.deliver(id, alice);
    }

    function test_Deliver_TwiceReverts() public {
        _nameThree(id);
        _deliver(id, alice);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Purse.AlreadyDelivered.selector, alice));
        purse.deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_Deliver_NonWinnerReverts() public {
        _nameThree(id);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Purse.NotAWinner.selector, relayer));
        purse.deliver(id, relayer);
    }

    function test_Deliver_OneSecondBeforeClaimBySucceeds() public {
        _nameThree(id);
        vm.warp(claimBy - 1);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_Deliver_ExactlyAtClaimByIsClosed() public {
        _nameThree(id);
        vm.warp(claimBy);
        vm.prank(relayer);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, alice);
    }

    function test_Deliver_AfterClaimByReverts() public {
        _nameThree(id);
        vm.warp(claimBy + 1 days);
        vm.prank(relayer);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, alice);
    }

    function test_Deliver_PaysWinnerNotCaller() public {
        _nameThree(id);
        vm.prank(bob); // a winner calling for someone else
        purse.deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(bob), 0);
    }

    // ───────────── refund ─────────────
    function _threeFunders() internal {
        _add(id, sponsor1, 250e6);
        _add(id, sponsor2, 50e6);
    }

    function test_Refund_NoWinnersNamedEachFunderGetsOwnContribution() public {
        _threeFunders();
        vm.warp(nameBy + 1);

        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Refunded(id, sponsor1, 250e6);
        vm.prank(relayer); // anyone can trigger
        purse.refund(id, sponsor1);
        assertEq(usdc.balanceOf(sponsor1), 100_000e6);

        purse.refund(id, sponsor2);
        assertEq(usdc.balanceOf(sponsor2), 100_000e6);

        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Refunded(id, organiser, POOL);
        purse.refund(id, organiser);
        assertEq(usdc.balanceOf(organiser), 100_000e6);

        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(usdc.balanceOf(relayer), 0);
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.owed, 0);
        assertEq(v.pool, 0);
        assertEq(purse.contributionOf(id, sponsor1), 0);
    }

    function test_Refund_BeforeNameByReverts() public {
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, organiser);
    }

    function test_Refund_ExactlyAtNameByReverts() public {
        vm.warp(nameBy);
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, organiser);
    }

    function test_Refund_SecondRefundRevertsNothingToRefund() public {
        vm.warp(nameBy + 1);
        purse.refund(id, organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.NothingToRefund.selector, organiser));
        purse.refund(id, organiser);
    }

    function test_Refund_NonFunderRevertsNothingToRefund() public {
        vm.warp(nameBy + 1);
        vm.expectRevert(abi.encodeWithSelector(Purse.NothingToRefund.selector, alice));
        purse.refund(id, alice);
    }

    function test_Refund_BlockedOnceWinnersNamed() public {
        _threeFunders();
        _lock(id);
        vm.prank(organiser);
        purse.name(id, _a1(alice), _u1(1_300e6));
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, sponsor1);
        vm.warp(nameBy + 1);
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, sponsor1);
        vm.warp(claimBy + 1);
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, organiser);
    }

    function test_Refund_PartialRefundKeepsOthersOwed() public {
        _threeFunders();
        vm.warp(nameBy + 1);
        purse.refund(id, sponsor1);
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.pool, 1_050e6);
        assertEq(v.owed, 1_050e6);
        assertEq(usdc.balanceOf(address(purse)), 1_050e6);
    }

    function test_Refund_BlocklistedFunderDoesNotBlockOthers() public {
        _threeFunders();
        vm.warp(nameBy + 1);
        usdc.setBlocked(sponsor1, true);

        vm.expectRevert();
        purse.refund(id, sponsor1);
        assertEq(purse.contributionOf(id, sponsor1), 250e6); // unchanged
        assertEq(_owed(id), 1_300e6);

        purse.refund(id, sponsor2);
        purse.refund(id, organiser);
        assertEq(usdc.balanceOf(sponsor2), 100_000e6);
        assertEq(usdc.balanceOf(organiser), 100_000e6);
        assertEq(_owed(id), 250e6);
        assertEq(usdc.balanceOf(address(purse)), 250e6);

        usdc.setBlocked(sponsor1, false); // recoverable once unblocked
        purse.refund(id, sponsor1);
        assertEq(usdc.balanceOf(sponsor1), 100_000e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
    }

    // ───────────── sweep ─────────────
    function test_Sweep_BeforeClaimByReverts() public {
        _nameThree(id);
        vm.warp(claimBy - 1);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
    }

    function test_Sweep_OnUnnamedPurseReverts() public {
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
        vm.warp(claimBy + 10 days);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
    }

    function test_Sweep_SendsOnlyUndeliveredToOrganiser() public {
        _nameThree(id);
        _deliver(id, alice); // 500 delivered, 500 outstanding
        vm.warp(claimBy);
        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Swept(id, organiser, 500e6, relayer);
        vm.expectEmit(true, true, false, true, address(usdc));
        emit IERC20.Transfer(address(purse), organiser, 500e6);
        vm.prank(relayer);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), _organiserBalAfterFunding() + 500e6);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
        assertEq(usdc.balanceOf(relayer), 0);
    }

    function test_Sweep_TwiceReverts() public {
        _nameThree(id);
        vm.warp(claimBy);
        purse.sweep(id);
        vm.expectRevert(Purse.NothingToSweep.selector);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), 100_000e6);
    }

    function test_Sweep_AllDeliveredRevertsNothingToSweep() public {
        _nameThree(id);
        _deliver(id, alice);
        _deliver(id, bob);
        _deliver(id, carol);
        vm.warp(claimBy);
        vm.expectRevert(Purse.NothingToSweep.selector);
        purse.sweep(id);
    }

    function test_Sweep_DoesNotTouchOtherPurses() public {
        uint256 id2 = _create(77e6);
        _nameThree(id);
        vm.warp(claimBy);
        purse.sweep(id);
        assertEq(_owed(id2), 77e6);
        assertEq(usdc.balanceOf(address(purse)), 77e6);
    }

    function test_Sweep_BlocklistedOrganiserRevertsAndKeepsOwed() public {
        _nameThree(id);
        vm.warp(claimBy);
        usdc.setBlocked(organiser, true);
        vm.expectRevert();
        purse.sweep(id);
        assertEq(_owed(id), POOL);
        usdc.setBlocked(organiser, false);
        purse.sweep(id);
        assertEq(_owed(id), 0);
    }

    // ───────────── blocklisted winner ─────────────
    function test_Blocklisted_WinnerDeliverRevertsStateUnchangedOthersDeliver() public {
        _nameThree(id);
        usdc.setBlocked(alice, true);
        Purse.Winner[] memory before_ = purse.winnersOf(id);

        vm.prank(relayer);
        vm.expectRevert();
        purse.deliver(id, alice);

        Purse.Winner[] memory after_ = purse.winnersOf(id);
        assertEq(after_[0].delivered, before_[0].delivered);
        assertFalse(after_[0].delivered);
        assertEq(_owed(id), POOL);
        assertEq(usdc.balanceOf(address(purse)), POOL);
        assertEq(usdc.balanceOf(alice), 0);

        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(_owed(id), 500e6);
    }

    function test_Blocklisted_WinnerPrizeSweptBackToOrganiserAfterClaimBy() public {
        _nameThree(id);
        usdc.setBlocked(alice, true);
        _deliver(id, bob);
        _deliver(id, carol);
        vm.warp(claimBy);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), _organiserBalAfterFunding() + 500e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
        // delivery window is closed; alice can no longer be paid even if unblocked
        usdc.setBlocked(alice, false);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, alice);
    }

    function test_Blocklisted_WinnerCanBeDeliveredAfterUnblockedBeforeClaimBy() public {
        _nameThree(id);
        usdc.setBlocked(alice, true);
        vm.expectRevert();
        purse.deliver(id, alice);
        usdc.setBlocked(alice, false);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    // ───────────── stray donation ─────────────
    function test_StrayDonation_DoesNotBreakAccounting() public {
        usdc.mint(address(this), 33e6);
        usdc.transfer(address(purse), 33e6); // direct donation, not through create/add
        assertEq(usdc.balanceOf(address(purse)), POOL + 33e6);
        assertEq(_owed(id), POOL);
        assertGe(usdc.balanceOf(address(purse)), _owed(id));

        _nameThree(id);
        _deliver(id, alice);
        assertGe(usdc.balanceOf(address(purse)), _owed(id));
        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(_owed(id), 0);
        assertEq(usdc.balanceOf(address(purse)), 33e6); // donation is stuck by design
        assertEq(purse.purse(id).pool, POOL);
        assertEq(purse.contributionOf(id, address(this)), 0);
    }

    function test_StrayDonation_SweepAndRefundOnlyMoveOwed() public {
        usdc.mint(address(purse), 10e6);
        uint256 id2 = _create(POOL);
        _lock(id2);
        vm.prank(organiser);
        purse.name(id2, _a3(alice, bob, carol), _u3(500e6, 300e6, 200e6));
        vm.warp(claimBy);
        purse.sweep(id2); // named purse: sweeps owed only
        purse.refund(id, organiser); // unnamed purse: refunds contribution only
        assertEq(usdc.balanceOf(address(purse)), 10e6);
        assertEq(_owed(id), 0);
        assertEq(_owed(id2), 0);
    }
}
