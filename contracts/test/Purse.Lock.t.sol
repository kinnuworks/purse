// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";

/// lock(): access, timing, the lock-then-name flow, anti-griefing, refunds of unnamed locked purses.
contract PurseLockTest is PurseTestBase {
    uint256 internal id;
    address internal attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();
        id = _create(POOL);
        _fund(attacker, 1_000_000e6);
    }

    // ───────────── lock: happy path / events ─────────────
    function test_Lock_FreezesFundingAndEmits() public {
        vm.expectEmit(true, false, false, true, address(purse));
        emit Purse.FundingLocked(id, POOL);
        vm.prank(organiser);
        purse.lock(id);
        assertTrue(purse.purse(id).locked);
        assertFalse(purse.purse(id).named);
        assertEq(purse.purse(id).pool, POOL);
        assertEq(usdc.balanceOf(address(purse)), POOL); // locking moves no funds
    }

    function test_Lock_EventCarriesCurrentPoolAfterSponsorAdds() public {
        _add(id, sponsor1, 250e6);
        vm.expectEmit(true, false, false, true, address(purse));
        emit Purse.FundingLocked(id, POOL + 250e6);
        _lock(id);
    }

    function test_Lock_AtNameByInclusiveSucceeds() public {
        vm.warp(nameBy);
        _lock(id);
        assertTrue(purse.purse(id).locked);
    }

    function test_Lock_OnlyAffectsThatPurse() public {
        uint256 id2 = _create(10e6);
        _lock(id);
        assertTrue(purse.purse(id).locked);
        assertFalse(purse.purse(id2).locked);
        _add(id2, sponsor1, 1e6); // still fundable
        assertEq(purse.purse(id2).pool, 11e6);
    }

    // ───────────── lock: reverts ─────────────
    function test_Lock_NonOrganiserReverts() public {
        vm.prank(sponsor1);
        vm.expectRevert(abi.encodeWithSelector(Purse.NotOrganiser.selector, sponsor1, organiser));
        purse.lock(id);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Purse.NotOrganiser.selector, attacker, organiser));
        purse.lock(id);
        assertFalse(purse.purse(id).locked);
    }

    function test_Lock_LateReverts() public {
        vm.warp(nameBy + 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.lock(id);
        assertFalse(purse.purse(id).locked);
    }

    function test_Lock_DoubleLockReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AlreadyLocked.selector, id));
        purse.lock(id);
    }

    /// named => locked, so lock() on a named purse trips AlreadyLocked first; the
    /// AlreadyNamed branch in lock() is unreachable. Either way it cannot succeed.
    function test_Lock_AfterNamedReverts() public {
        _nameThree(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AlreadyLocked.selector, id));
        purse.lock(id);
    }

    // ───────────── add vs lock ─────────────
    function test_Add_AfterLockRevertsFundingIsLocked() public {
        _lock(id);
        vm.prank(sponsor1);
        vm.expectRevert(abi.encodeWithSelector(Purse.FundingIsLocked.selector, id));
        purse.add(id, 1e6);
        assertEq(purse.purse(id).pool, POOL);
        assertEq(purse.contributionOf(id, sponsor1), 0);
    }

    function test_Add_AfterLockRevertsEvenAfterNameBy() public {
        _lock(id);
        vm.warp(nameBy + 1);
        vm.prank(sponsor1);
        vm.expectRevert(abi.encodeWithSelector(Purse.FundingIsLocked.selector, id));
        purse.add(id, 1e6);
    }

    function test_Add_OrganiserCannotAddAfterLockEither() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.FundingIsLocked.selector, id));
        purse.add(id, 1e6);
    }

    // ───────────── name requires lock ─────────────
    function test_Name_WithoutLockRevertsNotLocked() public {
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.NotLocked.selector, id));
        purse.name(id, _a3(alice, bob, carol), _u3(500e6, 300e6, 200e6));
        Purse.PurseView memory v = purse.purse(id);
        assertFalse(v.named);
        assertFalse(v.locked); // name() did not lock implicitly
        assertEq(v.claimBy, 0);
        // the purse stays fundable because nothing locked it
        _add(id, sponsor1, 1e6);
    }

    function test_Name_NotLockedCheckedAfterAuthAndTiming() public {
        vm.prank(sponsor1);
        vm.expectRevert(abi.encodeWithSelector(Purse.NotOrganiser.selector, sponsor1, organiser));
        purse.name(id, _a1(alice), _u1(POOL));
        vm.warp(nameBy + 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.name(id, _a1(alice), _u1(POOL));
    }

    function test_Name_LockedButAfterNameByRevertsNamingClosed() public {
        _lock(id);
        vm.warp(nameBy + 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.name(id, _a1(alice), _u1(POOL));
    }

    function test_Name_AfterLockSucceedsAndDoesNotRelock() public {
        _lock(id);
        _nameThree(id);
        assertTrue(purse.purse(id).named);
        assertTrue(purse.purse(id).locked);
    }

    // ───────────── anti-griefing scenario ─────────────
    function test_Griefing_LockedPurseCannotBeToppedUpByAttackerAndNamingSucceeds() public {
        _add(id, sponsor1, 250e6);
        _lock(id); // organiser freezes the pool: 1_250e6
        uint256 attackerBefore = usdc.balanceOf(attacker);

        // attacker tries to change the pool right before naming
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Purse.FundingIsLocked.selector, id));
        purse.add(id, 1e6);
        assertEq(usdc.balanceOf(attacker), attackerBefore);
        assertEq(purse.purse(id).pool, 1_250e6);

        // naming with the exact signed amounts succeeds
        vm.prank(organiser);
        purse.name(id, _a3(alice, bob, carol), _u3(750e6, 300e6, 200e6));
        assertTrue(purse.purse(id).named);
        assertEq(purse.purse(id).pool, 1_250e6);
        assertEq(purse.purse(id).owed, 1_250e6);
        _deliver(id, alice);
        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(usdc.balanceOf(alice), 750e6);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
    }

    function test_Griefing_DirectTransferAfterLockDoesNotChangePoolOrBreakNaming() public {
        _lock(id);
        usdc.mint(attacker, 500e6);
        vm.prank(attacker);
        usdc.transfer(address(purse), 500e6); // stray donation after the lock

        assertEq(usdc.balanceOf(address(purse)), POOL + 500e6);
        assertEq(purse.purse(id).pool, POOL);
        assertEq(purse.purse(id).owed, POOL);
        assertEq(purse.contributionOf(id, attacker), 0);

        // the donation can't be allocated: amounts must still sum to the accounted pool
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, POOL, POOL + 500e6));
        purse.name(id, _a1(alice), _u1(POOL + 500e6));

        // the original, exact naming still works
        _nameThree(id);
        assertTrue(purse.purse(id).named);
        _deliver(id, alice);
        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(usdc.balanceOf(address(purse)), 500e6); // donation stuck by design
    }

    function test_Griefing_SponsorsAddBeforeLockThenLockThenNameSumsToLargerPool() public {
        _add(id, sponsor1, 400e6);
        _add(id, sponsor2, 600e6);
        _lock(id);
        assertEq(purse.purse(id).pool, 2_000e6);

        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, 2_000e6, POOL));
        purse.name(id, _a1(alice), _u1(POOL)); // stale, smaller allocation

        vm.prank(organiser);
        purse.name(id, _a3(alice, bob, carol), _u3(1_000e6, 700e6, 300e6));
        assertEq(purse.purse(id).pool, 2_000e6);
        assertEq(purse.purse(id).owed, 2_000e6);
        assertEq(usdc.balanceOf(address(purse)), 2_000e6);
    }

    // ───────────── locked but never named => refunds ─────────────
    function test_LockedNeverNamed_RefundsAvailableAfterNameBy() public {
        _add(id, sponsor1, 250e6);
        _add(id, sponsor2, 50e6);
        _lock(id);

        // not refundable while the naming window is open, even though locked
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, sponsor1);
        vm.warp(nameBy);
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(id, sponsor1);

        vm.warp(nameBy + 1);
        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Refunded(id, sponsor1, 250e6);
        vm.prank(relayer);
        purse.refund(id, sponsor1);
        purse.refund(id, sponsor2);
        purse.refund(id, organiser);

        assertEq(usdc.balanceOf(sponsor1), 100_000e6);
        assertEq(usdc.balanceOf(sponsor2), 100_000e6);
        assertEq(usdc.balanceOf(organiser), 100_000e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(purse.purse(id).owed, 0);
        assertEq(purse.purse(id).pool, 0);
        assertTrue(purse.purse(id).locked); // lock is irrevocable
        assertFalse(purse.purse(id).named);
    }

    function test_LockedNeverNamed_CannotBeNamedOrSweptAfterNameBy() public {
        _lock(id);
        vm.warp(nameBy + 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.name(id, _a1(alice), _u1(POOL));
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
        vm.expectRevert(Purse.NotNamed.selector);
        purse.deliver(id, alice);
    }
}
