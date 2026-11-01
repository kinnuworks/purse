// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Purse} from "../Purse.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixtures/helpers. Contains NO test functions.
abstract contract PurseTestBase is Test {
    Purse internal purse;
    MockUSDC internal usdc;

    address internal organiser = makeAddr("organiser");
    address internal sponsor1 = makeAddr("sponsor1");
    address internal sponsor2 = makeAddr("sponsor2");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal relayer = makeAddr("relayer"); // no USDC, no gas

    uint256 internal constant POOL = 1_000e6;
    uint64 internal constant T_START = 1_000_000;
    uint64 internal constant CLAIM_WINDOW = 7 days;
    uint64 internal nameBy;
    /// @dev Expected claimBy when winners are named at T_START.
    uint64 internal claimBy;

    function setUp() public virtual {
        vm.warp(T_START);
        usdc = new MockUSDC();
        purse = new Purse(address(usdc));
        nameBy = T_START + 1 days;
        claimBy = T_START + CLAIM_WINDOW;
        _fund(organiser, 100_000e6);
        _fund(sponsor1, 100_000e6);
        _fund(sponsor2, 100_000e6);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(purse), type(uint256).max);
    }

    function _create(uint256 amount) internal returns (uint256 id) {
        vm.prank(organiser);
        id = purse.create("Hackathon", amount, nameBy, CLAIM_WINDOW);
    }

    function _createW(uint256 amount, uint64 window) internal returns (uint256 id) {
        vm.prank(organiser);
        id = purse.create("Hackathon", amount, nameBy, window);
    }

    function _lock(uint256 id) internal {
        vm.prank(purse.purse(id).organiser);
        purse.lock(id);
    }

    function _ensureLocked(uint256 id) internal {
        if (!purse.purse(id).locked) _lock(id);
    }

    /// @dev Sum of owed over every purse (view-only accounting).
    function _sumOwed() internal view returns (uint256 sum) {
        uint256 n = purse.purseCount();
        for (uint256 i = 0; i < n; ++i) {
            sum += purse.purse(i).owed;
        }
    }

    function _add(uint256 id, address who, uint256 amount) internal {
        vm.prank(who);
        purse.add(id, amount);
    }

    function _a1(address a) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = a;
    }

    function _a3(address a, address b, address c) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    function _u1(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _u2(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    function _u3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory r) {
        r = new uint256[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    /// @dev Locks (if needed), then names alice 500 / bob 300 / carol 200 (requires pool == POOL).
    function _nameThree(uint256 id) internal {
        _ensureLocked(id);
        vm.prank(organiser);
        purse.name(id, _a3(alice, bob, carol), _u3(500e6, 300e6, 200e6));
    }

    function _deliver(uint256 id, address winner) internal {
        vm.prank(relayer);
        purse.deliver(id, winner);
    }

    function _owed(uint256 id) internal view returns (uint256) {
        return purse.purse(id).owed;
    }
}
