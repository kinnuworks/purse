// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Purse} from "../Purse.sol";
import {ReentrantUSDC} from "./mocks/MockUSDC.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// A token whose transfer hook re-enters the Purse (msg.sender == token) must be rejected
/// by the nonReentrant guard, and the outer call must still settle correctly.
contract PurseReentrancyTest is Test {
    Purse internal purse;
    ReentrantUSDC internal tok;

    address internal organiser = makeAddr("organiser");
    address internal sponsor = makeAddr("sponsor");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant POOL = 1_000e6;
    uint64 internal nameBy;
    uint64 internal constant CLAIM_WINDOW = 7 days;
    uint64 internal claimBy;
    uint256 internal id;

    function setUp() public {
        vm.warp(1_000_000);
        tok = new ReentrantUSDC();
        purse = new Purse(address(tok));
        nameBy = uint64(block.timestamp + 1 days);
        claimBy = uint64(block.timestamp + CLAIM_WINDOW);
        _fund(organiser);
        _fund(sponsor);
        vm.prank(organiser);
        id = purse.create("Reentrancy", POOL, nameBy, CLAIM_WINDOW);
    }

    function _fund(address who) internal {
        tok.mint(who, 100_000e6);
        vm.prank(who);
        tok.approve(address(purse), type(uint256).max);
    }

    function _name() internal {
        address[] memory w = new address[](2);
        w[0] = alice;
        w[1] = bob;
        uint256[] memory a = new uint256[](2);
        a[0] = 600e6;
        a[1] = 400e6;
        vm.prank(organiser);
        purse.lock(id);
        vm.prank(organiser);
        purse.name(id, w, a);
    }

    function _assertRejected() internal view {
        assertTrue(tok.hookFired(), "hook did not fire");
        assertFalse(tok.hookSuccess(), "re-entry succeeded");
        assertEq(tok.hookReturn(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }

    function test_Reentrancy_DeliverReentersDeliver() public {
        _name();
        tok.arm(address(purse), abi.encodeCall(Purse.deliver, (id, bob)));
        purse.deliver(id, alice);
        _assertRejected();
        assertEq(tok.balanceOf(alice), 600e6);
        assertEq(tok.balanceOf(bob), 0);
        assertEq(purse.purse(id).owed, 400e6);
        assertEq(tok.balanceOf(address(purse)), 400e6);
    }

    function test_Reentrancy_SweepReentersDeliver() public {
        _name();
        vm.warp(claimBy);
        tok.arm(address(purse), abi.encodeCall(Purse.deliver, (id, alice)));
        purse.sweep(id);
        _assertRejected();
        assertEq(tok.balanceOf(address(purse)), 0);
        assertEq(purse.purse(id).owed, 0);
    }

    function test_Reentrancy_DeliverReentersSweep() public {
        _name();
        tok.arm(address(purse), abi.encodeCall(Purse.sweep, (id)));
        purse.deliver(id, alice);
        _assertRejected();
        assertEq(purse.purse(id).owed, 400e6);
    }

    function test_Reentrancy_DeliverReentersRefund() public {
        _name();
        tok.arm(address(purse), abi.encodeCall(Purse.refund, (id, organiser)));
        purse.deliver(id, alice);
        _assertRejected();
        assertEq(purse.contributionOf(id, organiser), POOL);
    }

    function test_Reentrancy_RefundReentersRefund() public {
        vm.prank(sponsor);
        purse.add(id, 500e6);
        vm.warp(nameBy + 1);
        tok.arm(address(purse), abi.encodeCall(Purse.refund, (id, organiser)));
        purse.refund(id, sponsor);
        _assertRejected();
        assertEq(tok.balanceOf(sponsor), 100_000e6);
        assertEq(purse.contributionOf(id, organiser), POOL); // untouched by the rejected re-entry
        assertEq(purse.purse(id).owed, POOL);
    }

    function test_Reentrancy_RefundReentersSameFunderRefund() public {
        vm.warp(nameBy + 1);
        tok.arm(address(purse), abi.encodeCall(Purse.refund, (id, organiser)));
        purse.refund(id, organiser);
        _assertRejected();
        assertEq(tok.balanceOf(organiser), 100_000e6); // paid exactly once
        assertEq(tok.balanceOf(address(purse)), 0);
    }

    function test_Reentrancy_SweepReentersSweep() public {
        _name();
        vm.warp(claimBy);
        tok.arm(address(purse), abi.encodeCall(Purse.sweep, (id)));
        purse.sweep(id);
        _assertRejected();
        assertEq(tok.balanceOf(organiser), 100_000e6); // paid exactly once
        assertEq(tok.balanceOf(address(purse)), 0);
    }

    function test_Reentrancy_CreateReentersAdd() public {
        // transferFrom hook fires inside create(): re-enter add on the purse being created
        tok.arm(address(purse), abi.encodeCall(Purse.add, (1, 5e6)));
        vm.prank(organiser);
        uint256 id2 = purse.create("Second", 10e6, nameBy, CLAIM_WINDOW);
        assertEq(id2, 1);
        _assertRejected();
        assertEq(purse.purse(1).pool, 10e6);
    }

    function test_Reentrancy_AddReentersCreate() public {
        tok.arm(address(purse), abi.encodeCall(Purse.create, ("evil", 1e6, nameBy, CLAIM_WINDOW)));
        vm.prank(sponsor);
        purse.add(id, 5e6);
        _assertRejected();
        assertEq(purse.purseCount(), 1);
        assertEq(purse.purse(id).pool, POOL + 5e6);
    }
}
