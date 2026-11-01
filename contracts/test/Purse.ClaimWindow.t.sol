// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";

/// claimWindow (seconds) / claimBy (stored at naming time = naming time + window).
contract PurseClaimWindowTest is PurseTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create(POOL);
    }

    // ───────────── create validation ─────────────
    function test_Create_WindowBelowMinimumReverts() public {
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.ClaimWindowTooShort.selector, uint64(59), uint64(60)));
        purse.create("x", POOL, nameBy, 59);
    }

    function test_Create_ZeroWindowReverts() public {
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.ClaimWindowTooShort.selector, uint64(0), uint64(60)));
        purse.create("x", POOL, nameBy, 0);
    }

    function test_Create_ExactlyMinimumWindowSucceeds() public {
        uint256 id2 = _createW(POOL, 60);
        assertEq(purse.purse(id2).claimWindow, 60);
        assertEq(purse.purse(id2).claimBy, 0);
    }

    function test_Create_NameByNotAfterNowRevertsInvalidDeadlines() public {
        vm.prank(organiser);
        vm.expectRevert(Purse.InvalidDeadlines.selector);
        purse.create("x", POOL, T_START, 60);
        vm.prank(organiser);
        vm.expectRevert(Purse.InvalidDeadlines.selector);
        purse.create("x", POOL, T_START - 1, 60);
    }

    function test_Create_NameByOneSecondAheadSucceeds() public {
        vm.prank(organiser);
        uint256 id2 = purse.create("x", POOL, T_START + 1, 60);
        assertEq(purse.purse(id2).nameBy, T_START + 1);
    }

    function test_Create_ValidationOrderAmountThenDeadlinesThenWindow() public {
        vm.prank(organiser);
        vm.expectRevert(Purse.ZeroAmount.selector);
        purse.create("x", 0, T_START, 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.InvalidDeadlines.selector);
        purse.create("x", POOL, T_START, 1);
    }

    function test_Create_ShortWindowRevertLeavesNoPurse() public {
        uint256 count = purse.purseCount();
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.ClaimWindowTooShort.selector, uint64(1), uint64(60)));
        purse.create("x", POOL, nameBy, 1);
        assertEq(purse.purseCount(), count);
        assertEq(usdc.balanceOf(address(purse)), POOL);
    }

    // ───────────── claimBy at naming ─────────────
    function test_ClaimBy_ZeroBeforeNamingEvenAfterTimePasses() public {
        assertEq(purse.purse(id).claimBy, 0);
        _lock(id);
        assertEq(purse.purse(id).claimBy, 0); // lock does not set it
        vm.warp(nameBy + 30 days);
        assertEq(purse.purse(id).claimBy, 0);
    }

    function test_ClaimBy_EqualsNamingTimePlusWindow() public {
        _lock(id);
        uint256 namedAt = T_START + 3 hours;
        vm.warp(namedAt);
        _nameThree(id);
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.claimBy, namedAt + CLAIM_WINDOW);
        assertEq(v.claimWindow, CLAIM_WINDOW);
    }

    function test_ClaimBy_WinnersNamedEventCarriesClaimBy() public {
        _lock(id);
        vm.warp(T_START + 90 minutes);
        vm.expectEmit(true, false, false, true, address(purse));
        emit Purse.WinnersNamed(
            id, _a3(alice, bob, carol), _u3(500e6, 300e6, 200e6), T_START + 90 minutes + CLAIM_WINDOW
        );
        _nameThree(id);
    }

    function test_ClaimBy_NamingAtVeryLastSecondStillGivesFullWindow() public {
        _lock(id);
        vm.warp(nameBy); // last allowed second
        _nameThree(id);
        uint256 expected = uint256(nameBy) + CLAIM_WINDOW;
        assertEq(purse.purse(id).claimBy, expected);

        // winners are not shortened: still deliverable a full window later (minus one second)
        vm.warp(expected - 1);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
        vm.warp(expected);
        vm.prank(relayer);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, bob);
    }

    function test_ClaimBy_MinimumWindowNamedAtLastSecond() public {
        uint256 id2 = _createW(POOL, 60);
        _lock(id2);
        vm.warp(nameBy);
        _nameThree(id2);
        assertEq(purse.purse(id2).claimBy, uint256(nameBy) + 60);
        vm.warp(uint256(nameBy) + 59);
        _deliver(id2, alice);
        vm.warp(uint256(nameBy) + 60);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id2, bob);
        purse.sweep(id2);
        assertEq(_owed(id2), 0);
    }

    function test_ClaimBy_TwoPursesWithDifferentWindows() public {
        uint256 shortId = _createW(POOL, 60);
        uint256 longId = _createW(POOL, 30 days);
        _lock(shortId);
        _lock(longId);

        vm.warp(T_START + 100);
        _nameThree(shortId);
        vm.warp(T_START + 5 hours);
        _nameThree(longId);

        assertEq(purse.purse(shortId).claimBy, T_START + 100 + 60);
        assertEq(purse.purse(longId).claimBy, T_START + 5 hours + 30 days);
        assertEq(purse.purse(id).claimBy, 0); // third purse untouched

        // after the short window closed, the long one is still open
        vm.warp(T_START + 6 hours);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(shortId, alice);
        purse.sweep(shortId);
        _deliver(longId, alice);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(longId);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_owed(longId), 500e6);
        assertEq(_owed(shortId), 0);
    }

    // ───────────── deliver / sweep boundaries ─────────────
    function test_Deliver_OneSecondBeforeClaimByOk_AtClaimByClosed() public {
        _nameThree(id);
        uint256 cb = purse.purse(id).claimBy;
        assertEq(cb, claimBy);
        vm.warp(cb - 1);
        _deliver(id, alice);
        vm.warp(cb);
        vm.prank(relayer);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, bob);
    }

    function test_Sweep_OneSecondBeforeClaimByReverts_AtClaimByWorks() public {
        _nameThree(id);
        uint256 cb = purse.purse(id).claimBy;
        vm.warp(cb - 1);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
        vm.warp(cb);
        vm.prank(relayer);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), 100_000e6); // everything undelivered returned
        assertEq(usdc.balanceOf(address(purse)), 0);
    }

    function test_Deliver_AndSweep_BeforeNamingRevertEvenAfterLongTime() public {
        vm.warp(T_START + 365 days);
        vm.expectRevert(Purse.NotNamed.selector);
        purse.deliver(id, alice);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
    }

    function test_Deliver_AndSweep_OnLockedUnnamedPurseRevert() public {
        _lock(id);
        vm.warp(T_START + 365 days);
        vm.expectRevert(Purse.NotNamed.selector);
        purse.deliver(id, alice);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
    }

    function test_ClaimBy_UnchangedByDeliverAndSweep() public {
        _nameThree(id);
        _deliver(id, alice);
        assertEq(purse.purse(id).claimBy, claimBy);
        vm.warp(claimBy);
        purse.sweep(id);
        assertEq(purse.purse(id).claimBy, claimBy);
        assertEq(purse.purse(id).claimWindow, CLAIM_WINDOW);
    }
}
