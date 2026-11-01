// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";

/// Direct USDC transfers to the contract are ignored by accounting (never balanceOf) and
/// stuck by design. At every lifecycle stage a donation must leave every purse untouched.
contract PurseStrayTest is PurseTestBase {
    address internal donor = makeAddr("donor");
    uint256 internal donated;

    function setUp() public override {
        super.setUp();
        usdc.mint(donor, 1_000_000e6);
    }

    // ───────────── helpers ─────────────
    function _donateRaw(uint256 amount) internal {
        vm.prank(donor);
        usdc.transfer(address(purse), amount);
        donated += amount;
    }

    function _viewHash(uint256 id) internal view returns (bytes32) {
        return keccak256(abi.encode(purse.purse(id), purse.winnersOf(id)));
    }

    function _hashes() internal view returns (bytes32[] memory h) {
        uint256 n = purse.purseCount();
        h = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            h[i] = _viewHash(i);
        }
    }

    /// @dev Donates and proves no purse view (incl. winners) changed and the surplus is exactly the donations.
    function _donateAndAssertInert(uint256 amount) internal {
        bytes32[] memory beforeH = _hashes();
        _donateRaw(amount);
        bytes32[] memory afterH = _hashes();
        assertEq(afterH.length, beforeH.length);
        for (uint256 i = 0; i < beforeH.length; ++i) {
            assertEq(afterH[i], beforeH[i], "purse view changed by donation");
        }
        _assertSurplus();
    }

    function _assertSurplus() internal view {
        assertEq(usdc.balanceOf(address(purse)) - _sumOwed(), donated, "balance - sum(owed) != donated");
    }

    // ───────────── each stage ─────────────
    function test_Stray_BeforeCreate() public {
        _donateRaw(77e6);
        assertEq(purse.purseCount(), 0);
        uint256 id = _create(POOL);
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.pool, POOL);
        assertEq(v.owed, POOL);
        assertEq(purse.contributionOf(id, donor), 0);
        assertEq(purse.contributionOf(id, organiser), POOL);
        _assertSurplus();

        _nameThree(id); // exact pool only; the 77e6 is not allocatable
        _deliver(id, alice);
        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(address(purse)), 77e6);
        _assertSurplus();
    }

    function test_Stray_MidLife_AddedFundersAndLock() public {
        uint256 id = _create(POOL);
        _donateAndAssertInert(10e6);
        _add(id, sponsor1, 250e6);
        _donateAndAssertInert(20e6);
        assertEq(purse.purse(id).pool, POOL + 250e6);
        _lock(id);
        _donateAndAssertInert(30e6);

        // naming must match the accounted pool, not the balance
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, 1_250e6, 1_310e6));
        purse.name(id, _a1(alice), _u1(1_310e6));
        vm.prank(organiser);
        purse.name(id, _a3(alice, bob, carol), _u3(750e6, 300e6, 200e6));
        assertEq(purse.purse(id).pool, 1_250e6);
    }

    function test_Stray_AfterLock() public {
        uint256 id = _create(POOL);
        _lock(id);
        _donateAndAssertInert(5e6);
        _nameThree(id);
        assertEq(purse.purse(id).owed, POOL);
        _assertSurplus();
    }

    function test_Stray_AfterNaming_DeliverPaysExactAccountedAmounts() public {
        uint256 id = _create(POOL);
        _nameThree(id);
        _donateAndAssertInert(40e6);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6); // not 500 + share of donation
        assertEq(purse.purse(id).owed, 500e6);
        _assertSurplus();
        _deliver(id, bob);
        _deliver(id, carol);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(purse.purse(id).owed, 0);
        assertEq(usdc.balanceOf(address(purse)), 40e6);
    }

    function test_Stray_AfterClaim_SweepMovesOnlyOwed() public {
        uint256 id = _create(POOL);
        _nameThree(id);
        _deliver(id, alice);
        _donateAndAssertInert(15e6); // after a claim
        vm.warp(claimBy);
        uint256 orgBefore = usdc.balanceOf(organiser);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), orgBefore + 500e6); // only the 500 undelivered
        assertEq(purse.purse(id).owed, 0);
        assertEq(usdc.balanceOf(address(purse)), 15e6);
        _assertSurplus();
    }

    function test_Stray_UnnamedRefundsPayExactContributions() public {
        uint256 id = _create(POOL);
        _add(id, sponsor1, 250e6);
        _lock(id);
        _donateAndAssertInert(60e6);
        vm.warp(nameBy + 1);
        _donateAndAssertInert(1e6);
        purse.refund(id, sponsor1);
        assertEq(usdc.balanceOf(sponsor1), 100_000e6); // exactly its 250 back
        _assertSurplus();
        purse.refund(id, organiser);
        assertEq(usdc.balanceOf(organiser), 100_000e6);
        assertEq(purse.purse(id).owed, 0);
        assertEq(purse.purse(id).pool, 0);
        assertEq(usdc.balanceOf(address(purse)), 61e6);
    }

    // ───────────── everything at once, several purses ─────────────
    function test_Stray_AllStagesMultiplePurses_DonationStaysStuck() public {
        _donateRaw(3e6); // before any purse
        uint256 a = _create(POOL); // will be named and partly delivered, rest swept
        uint256 b = _create(400e6); // unnamed -> refunded
        uint256 c = _create(POOL); // named, fully delivered
        _donateAndAssertInert(1e6);
        _add(a, sponsor1, 100e6); // a pool 1_100e6 ... sponsor adds happen BEFORE lock
        _donateAndAssertInert(2e6);
        _lock(a);
        _lock(c);
        _donateAndAssertInert(4e6);

        vm.prank(organiser);
        purse.name(a, _a3(alice, bob, carol), _u3(600e6, 300e6, 200e6));
        _nameThree(c);
        _donateAndAssertInert(8e6);

        _deliver(a, alice);
        _deliver(c, alice);
        _deliver(c, bob);
        _deliver(c, carol);
        _donateAndAssertInert(16e6);
        assertEq(usdc.balanceOf(alice), 1_100e6);

        vm.warp(nameBy + 1);
        purse.refund(b, organiser);
        assertEq(purse.purse(b).owed, 0);
        _donateAndAssertInert(32e6);

        vm.warp(claimBy);
        purse.sweep(a);
        assertEq(purse.purse(a).owed, 0);
        _donateAndAssertInert(64e6);

        // everything settled: all accounting is zero, only the donations remain
        assertEq(_sumOwed(), 0);
        uint256 total = 3 + 1 + 2 + 4 + 8 + 16 + 32 + 64;
        assertEq(donated, total * 1e6);
        assertEq(usdc.balanceOf(address(purse)), donated);

        // and nothing in the contract can ever move them
        vm.expectRevert(Purse.NothingToSweep.selector);
        purse.sweep(a);
        vm.expectRevert(Purse.NothingToSweep.selector);
        purse.sweep(c);
        vm.expectRevert(Purse.RefundNotAvailable.selector);
        purse.refund(a, organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.NothingToRefund.selector, donor));
        purse.refund(b, donor);
        vm.expectRevert(abi.encodeWithSelector(Purse.NothingToRefund.selector, organiser));
        purse.refund(b, organiser);
        assertEq(usdc.balanceOf(address(purse)), donated);
        assertEq(usdc.balanceOf(donor), 1_000_000e6 - donated);
    }
}
