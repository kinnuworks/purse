// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";

/// name(): access, timing, validation, amounts. Validation tests lock first
/// (naming requires a prior lock); the NotLocked case lives in Purse.Lock.t.sol.
contract PurseNameTest is PurseTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create(POOL);
    }

    function _name(address[] memory w, uint256[] memory a) internal {
        _ensureLocked(id);
        vm.prank(organiser);
        purse.name(id, w, a);
    }

    function _many(uint256 n, uint256 each) internal pure returns (address[] memory w, uint256[] memory a) {
        w = new address[](n);
        a = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            w[i] = address(uint160(0x1000 + i));
            a[i] = each;
        }
    }

    function test_Name_SetsStateAndKeepsLock() public {
        _nameThree(id);
        Purse.PurseView memory v = purse.purse(id);
        assertTrue(v.named);
        assertTrue(v.locked);
        assertEq(v.claimBy, T_START + CLAIM_WINDOW);
        assertEq(v.owed, POOL);
        assertEq(usdc.balanceOf(address(purse)), POOL); // naming moves no funds
    }

    function test_Name_AmountsTooLowReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, POOL, 999e6));
        purse.name(id, _a3(alice, bob, carol), _u3(500e6, 300e6, 199e6));
    }

    function test_Name_AmountsTooHighReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, POOL, 1_001e6));
        purse.name(id, _a3(alice, bob, carol), _u3(500e6, 300e6, 201e6));
    }

    function test_Name_AmountsTooHighByOneWeiReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, POOL, POOL + 1));
        purse.name(id, _a1(alice), _u1(POOL + 1));
    }

    function test_Name_TwiceReverts() public {
        _nameThree(id);
        vm.prank(organiser);
        vm.expectRevert(Purse.AlreadyNamed.selector);
        purse.name(id, _a1(alice), _u1(POOL));
    }

    function test_Name_AfterNameByReverts() public {
        vm.warp(nameBy + 1);
        vm.prank(organiser);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.name(id, _a1(alice), _u1(POOL));
    }

    function test_Name_ExactlyAtNameBySucceeds() public {
        _lock(id);
        vm.warp(nameBy);
        _nameThree(id);
        assertTrue(purse.purse(id).named);
    }

    function test_Name_NonOrganiserReverts() public {
        vm.prank(sponsor1); // even a funder cannot name
        vm.expectRevert(abi.encodeWithSelector(Purse.NotOrganiser.selector, sponsor1, organiser));
        purse.name(id, _a1(alice), _u1(POOL));
    }

    function test_Name_ZeroAddressReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(Purse.ZeroAddress.selector);
        purse.name(id, _a3(alice, address(0), carol), _u3(500e6, 300e6, 200e6));
    }

    function test_Name_ZeroAmountReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(Purse.ZeroAmount.selector);
        purse.name(id, _a3(alice, bob, carol), _u3(POOL, 0, 0));
    }

    function test_Name_DuplicateWinnerReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.DuplicateWinner.selector, alice));
        purse.name(id, _a3(alice, bob, alice), _u3(500e6, 300e6, 200e6));
    }

    function test_Name_LengthMismatchReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.LengthMismatch.selector, 3, 2));
        purse.name(id, _a3(alice, bob, carol), _u2(500e6, 500e6));
    }

    function test_Name_ZeroWinnersReverts() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.InvalidWinnerCount.selector, 0));
        purse.name(id, new address[](0), new uint256[](0));
    }

    function test_Name_51WinnersReverts() public {
        uint256 id2 = _create(51e6);
        _lock(id2);
        (address[] memory w, uint256[] memory a) = _many(51, 1e6);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.InvalidWinnerCount.selector, 51));
        purse.name(id2, w, a);
    }

    function test_Name_Exactly50WinnersSucceedsAndAllDeliverable() public {
        uint256 id2 = _create(50e6);
        _lock(id2);
        (address[] memory w, uint256[] memory a) = _many(50, 1e6);
        vm.expectEmit(true, false, false, true, address(purse));
        emit Purse.WinnersNamed(id2, w, a, T_START + CLAIM_WINDOW);
        vm.prank(organiser);
        purse.name(id2, w, a);
        assertEq(purse.purse(id2).winnerCount, 50);
        for (uint256 i = 0; i < 50; ++i) {
            _deliver(id2, w[i]);
            assertEq(usdc.balanceOf(w[i]), 1e6);
        }
        assertEq(_owed(id2), 0);
    }

    function test_Name_FailedAttemptLeavesNoState() public {
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert();
        purse.name(id, _a3(alice, bob, alice), _u3(500e6, 300e6, 200e6));
        assertFalse(purse.purse(id).named);
        assertEq(purse.purse(id).claimBy, 0);
        assertEq(purse.winnersOf(id).length, 0);
        // alice may still be validly named afterwards (no stale winner index)
        _nameThree(id);
        assertEq(purse.winnersOf(id).length, 3);
    }

    function test_Name_SingleWinnerTakesWholePool() public {
        _add(id, sponsor1, 200e6);
        _lock(id);
        _name(_a1(alice), _u1(1_200e6));
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 1_200e6);
        assertEq(usdc.balanceOf(address(purse)), 0);
    }
}
