// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";

contract PurseFuzzTest is PurseTestBase {
    /// @dev n distinct winners, amounts all >= 2 and summing exactly to `pool`.
    function _split(uint256 n, uint256 pool, uint256 salt)
        internal
        pure
        returns (address[] memory w, uint256[] memory a)
    {
        w = new address[](n);
        a = new uint256[](n);
        uint256 remaining = pool - 2 * n; // caller guarantees pool >= 2n
        for (uint256 i = 0; i < n; ++i) {
            w[i] = address(uint160(0x10000 + i));
            uint256 extra = i == n - 1 ? remaining : uint256(keccak256(abi.encode(salt, i))) % (remaining + 1);
            remaining -= extra;
            a[i] = 2 + extra;
        }
    }

    /// @dev funds the purse from organiser + sponsors with a fuzzed split; returns id.
    function _fundedPurse(uint256 pool, uint256 salt) internal returns (uint256 id) {
        _fund(organiser, pool);
        _fund(sponsor1, pool);
        _fund(sponsor2, pool);
        uint256 s1 = uint256(keccak256(abi.encode(salt, "s1"))) % (pool / 2 + 1);
        uint256 s2 = uint256(keccak256(abi.encode(salt, "s2"))) % (pool / 2 + 1);
        s2 = s2 > pool - s1 - 1 ? 0 : s2; // organiser keeps >= 1
        uint256 orgAmt = pool - s1 - s2;
        id = _create(orgAmt);
        if (s1 > 0) _add(id, sponsor1, s1);
        if (s2 > 0) _add(id, sponsor2, s2);
        assertEq(purse.purse(id).pool, pool);
    }

    function testFuzz_PoolSplitAmongWinnersFullyDelivered(uint256 nSeed, uint256 poolSeed, uint256 salt) public {
        uint256 n = bound(nSeed, 1, 50);
        uint256 pool = bound(poolSeed, 2 * n, 1e15);
        uint256 id = _fundedPurse(pool, salt);
        (address[] memory w, uint256[] memory a) = _split(n, pool, salt);

        _lock(id);
        vm.prank(organiser);
        purse.name(id, w, a);
        assertEq(purse.winnersOf(id).length, n);

        uint256 paid;
        for (uint256 i = 0; i < n; ++i) {
            _deliver(id, w[i]);
            assertEq(usdc.balanceOf(w[i]), a[i]);
            paid += a[i];
            assertEq(_owed(id), pool - paid);
            assertEq(usdc.balanceOf(address(purse)), pool - paid);
        }
        assertEq(paid, pool);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
        assertEq(usdc.balanceOf(relayer), 0);
    }

    function testFuzz_SumTooHighReverts(uint256 nSeed, uint256 poolSeed, uint256 salt, uint256 dSeed) public {
        uint256 n = bound(nSeed, 1, 50);
        uint256 pool = bound(poolSeed, 2 * n, 1e15);
        uint256 d = bound(dSeed, 1, 1e15);
        uint256 id = _fundedPurse(pool, salt);
        (address[] memory w, uint256[] memory a) = _split(n, pool, salt);
        a[n - 1] += d;
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, pool, pool + d));
        purse.name(id, w, a);
        assertFalse(purse.purse(id).named);
    }

    function testFuzz_SumTooLowReverts(uint256 nSeed, uint256 poolSeed, uint256 salt, uint256 dSeed) public {
        uint256 n = bound(nSeed, 1, 50);
        uint256 pool = bound(poolSeed, 2 * n, 1e15);
        uint256 id = _fundedPurse(pool, salt);
        (address[] memory w, uint256[] memory a) = _split(n, pool, salt);
        uint256 d = bound(dSeed, 1, a[n - 1] - 1); // keep last amount >= 1
        a[n - 1] -= d;
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, pool, pool - d));
        purse.name(id, w, a);
        assertFalse(purse.purse(id).named);
    }

    function testFuzz_UndeliveredPrizesSweptExactly(uint256 poolSeed, uint8 deliverMask) public {
        uint256 pool = bound(poolSeed, 6, 1e15);
        uint256 id = _fundedPurse(pool, poolSeed);
        (address[] memory w, uint256[] memory a) = _split(3, pool, poolSeed);
        _lock(id);
        vm.prank(organiser);
        purse.name(id, w, a);
        uint256 undelivered;
        for (uint256 i = 0; i < 3; ++i) {
            if ((deliverMask >> i) & 1 == 1) _deliver(id, w[i]);
            else undelivered += a[i];
        }
        vm.warp(claimBy);
        uint256 balBefore = usdc.balanceOf(organiser);
        if (undelivered == 0) {
            vm.expectRevert(Purse.NothingToSweep.selector);
            purse.sweep(id);
        } else {
            purse.sweep(id);
            assertEq(usdc.balanceOf(organiser), balBefore + undelivered);
        }
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
    }

    function testFuzz_RefundReturnsEachContribution(uint256 poolSeed, uint256 salt) public {
        uint256 pool = bound(poolSeed, 3, 1e15);
        uint256 id = _fundedPurse(pool, salt);
        uint256 c0 = purse.contributionOf(id, organiser);
        uint256 c1 = purse.contributionOf(id, sponsor1);
        uint256 c2 = purse.contributionOf(id, sponsor2);
        assertEq(c0 + c1 + c2, pool);
        uint256 b0 = usdc.balanceOf(organiser);
        uint256 b1 = usdc.balanceOf(sponsor1);
        uint256 b2 = usdc.balanceOf(sponsor2);
        vm.warp(nameBy + 1);
        purse.refund(id, organiser);
        if (c1 > 0) purse.refund(id, sponsor1);
        if (c2 > 0) purse.refund(id, sponsor2);
        assertEq(usdc.balanceOf(organiser), b0 + c0);
        assertEq(usdc.balanceOf(sponsor1), b1 + c1);
        assertEq(usdc.balanceOf(sponsor2), b2 + c2);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
    }

    // ───────────── claim window arithmetic ─────────────
    function _namedAt(uint256 windowSeed, uint256 timeSeed) internal returns (uint256 id, uint256 namedAt, uint64 window) {
        window = uint64(bound(windowSeed, 60, 3650 days));
        id = _createW(POOL, window);
        _lock(id);
        namedAt = bound(timeSeed, T_START, nameBy); // anywhere up to the inclusive deadline
        vm.warp(namedAt);
        _nameThree(id);
        assertEq(purse.purse(id).claimBy, namedAt + window, "claimBy != naming time + window");
        assertEq(purse.purse(id).claimWindow, window);
    }

    function testFuzz_ClaimBy_DeliverableUpToLastSecondSweepNot(uint256 windowSeed, uint256 timeSeed) public {
        (uint256 id, uint256 namedAt, uint64 window) = _namedAt(windowSeed, timeSeed);
        vm.warp(namedAt + window - 1);
        vm.expectRevert(Purse.ClaimWindowOpen.selector);
        purse.sweep(id);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function testFuzz_ClaimBy_ClosedAtClaimBySweepWorks(uint256 windowSeed, uint256 timeSeed, uint256 lateSeed) public {
        (uint256 id, uint256 namedAt, uint64 window) = _namedAt(windowSeed, timeSeed);
        vm.warp(namedAt + window + bound(lateSeed, 0, 400 days));
        vm.prank(relayer);
        vm.expectRevert(Purse.ClaimWindowClosed.selector);
        purse.deliver(id, alice);
        uint256 balBefore = usdc.balanceOf(organiser);
        purse.sweep(id);
        assertEq(usdc.balanceOf(organiser), balBefore + POOL);
        assertEq(_owed(id), 0);
    }

    function testFuzz_ClaimWindowBelowMinimumReverts(uint64 window) public {
        window = uint64(bound(window, 0, 59));
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.ClaimWindowTooShort.selector, window, uint64(60)));
        purse.create("x", POOL, nameBy, window);
    }

    function testFuzz_ClaimWindowAtOrAboveMinimumAccepted(uint64 window) public {
        window = uint64(bound(window, 60, type(uint64).max));
        uint256 id = _createW(POOL, window);
        assertEq(purse.purse(id).claimWindow, window);
        assertEq(purse.purse(id).claimBy, 0);
    }
}
