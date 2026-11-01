// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PurseTestBase} from "./Purse.Base.t.sol";
import {Purse} from "../Purse.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Constructor, create, add, views, unknown ids, and the full happy path.
contract PurseTest is PurseTestBase {
    // ───────────── constructor ─────────────
    function test_Constructor_ZeroAddressReverts() public {
        vm.expectRevert(Purse.ZeroAddress.selector);
        new Purse(address(0));
    }

    function test_Constructor_StoresUsdcAndConstants() public view {
        assertEq(address(purse.usdc()), address(usdc));
        assertEq(purse.MAX_WINNERS(), 50);
        assertEq(purse.MIN_CLAIM_WINDOW(), 60);
        assertEq(purse.purseCount(), 0);
    }

    // ───────────── create ─────────────
    function test_Create_StoresStateAndPullsFunds() public {
        uint256 id = _create(POOL);
        assertEq(id, 0);
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.organiser, organiser);
        assertEq(v.title, "Hackathon");
        assertEq(v.nameBy, nameBy);
        assertEq(v.claimWindow, CLAIM_WINDOW);
        assertEq(v.claimBy, 0); // set only at naming
        assertFalse(v.named);
        assertFalse(v.locked);
        assertEq(v.pool, POOL);
        assertEq(v.owed, POOL);
        assertEq(v.winnerCount, 0);
        assertEq(purse.contributionOf(id, organiser), POOL);
        assertEq(usdc.balanceOf(address(purse)), POOL);
        assertEq(usdc.balanceOf(organiser), 100_000e6 - POOL);
        assertEq(purse.purseCount(), 1);
    }

    function test_Create_EmitsPurseCreatedAndFunded() public {
        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.PurseCreated(0, organiser, "Hackathon", POOL, nameBy, CLAIM_WINDOW);
        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Funded(0, organiser, POOL, POOL);
        vm.expectEmit(true, true, false, true, address(usdc));
        emit IERC20.Transfer(organiser, address(purse), POOL);
        _create(POOL);
    }

    function test_Create_SequentialIdsAndIndependentOrganisers() public {
        uint256 id0 = _create(POOL);
        vm.prank(sponsor1);
        uint256 id1 = purse.create("Other", 5e6, nameBy, CLAIM_WINDOW);
        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(purse.purseCount(), 2);
        assertEq(purse.purse(1).organiser, sponsor1);
        assertEq(purse.contributionOf(1, organiser), 0);
    }

    function test_Create_ZeroAmountReverts() public {
        vm.prank(organiser);
        vm.expectRevert(Purse.ZeroAmount.selector);
        purse.create("x", 0, nameBy, CLAIM_WINDOW);
    }

    function test_Create_NameByInPastReverts() public {
        vm.prank(organiser);
        vm.expectRevert(Purse.InvalidDeadlines.selector);
        purse.create("x", POOL, T_START - 1, CLAIM_WINDOW);
    }

    function test_Create_NameByEqualNowReverts() public {
        vm.prank(organiser);
        vm.expectRevert(Purse.InvalidDeadlines.selector);
        purse.create("x", POOL, T_START, CLAIM_WINDOW);
    }

    function test_Create_WithoutAllowanceRevertsAndLeavesNoPurse() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        vm.expectRevert();
        purse.create("x", POOL, nameBy, CLAIM_WINDOW);
        assertEq(purse.purseCount(), 0);
    }

    // ───────────── add (sponsors) ─────────────
    function test_Add_SponsorTracksContributionAndGrowsPool() public {
        uint256 id = _create(POOL);
        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Funded(id, sponsor1, 250e6, POOL + 250e6);
        _add(id, sponsor1, 250e6);
        _add(id, sponsor2, 50e6);
        _add(id, sponsor1, 10e6); // accumulates per funder
        Purse.PurseView memory v = purse.purse(id);
        assertEq(v.pool, POOL + 310e6);
        assertEq(v.owed, POOL + 310e6);
        assertEq(purse.contributionOf(id, organiser), POOL);
        assertEq(purse.contributionOf(id, sponsor1), 260e6);
        assertEq(purse.contributionOf(id, sponsor2), 50e6);
        assertEq(usdc.balanceOf(address(purse)), POOL + 310e6);
    }

    function test_Add_WinnersMustSumToLargerPool() public {
        uint256 id = _create(POOL);
        _add(id, sponsor1, 500e6);
        _lock(id);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(Purse.AmountsDoNotMatchPool.selector, 1_500e6, 1_000e6));
        purse.name(id, _a1(alice), _u1(POOL)); // old pool size is now too low
        vm.prank(organiser);
        purse.name(id, _a3(alice, bob, carol), _u3(900e6, 400e6, 200e6));
        assertEq(purse.purse(id).pool, 1_500e6);
    }

    function test_Add_ZeroAmountReverts() public {
        uint256 id = _create(POOL);
        vm.prank(sponsor1);
        vm.expectRevert(Purse.ZeroAmount.selector);
        purse.add(id, 0);
    }

    function test_Add_AtNameByInclusiveSucceeds() public {
        uint256 id = _create(POOL);
        vm.warp(nameBy);
        _add(id, sponsor1, 1e6);
        assertEq(purse.purse(id).pool, POOL + 1e6);
    }

    function test_Add_AfterNameByReverts() public {
        uint256 id = _create(POOL);
        vm.warp(nameBy + 1);
        vm.prank(sponsor1);
        vm.expectRevert(Purse.NamingClosed.selector);
        purse.add(id, 1e6);
    }

    /// Naming requires a lock, so a named purse is always locked: add hits FundingIsLocked
    /// first (the AlreadyNamed branch in add() is unreachable).
    function test_Add_AfterNamedRevertsFundingIsLocked() public {
        uint256 id = _create(POOL);
        _nameThree(id);
        vm.prank(sponsor1);
        vm.expectRevert(abi.encodeWithSelector(Purse.FundingIsLocked.selector, id));
        purse.add(id, 1e6);
    }

    // ───────────── views ─────────────
    function test_Views_WinnersOfAndPurseAfterNaming() public {
        uint256 id = _create(POOL);
        assertEq(purse.winnersOf(id).length, 0);
        _nameThree(id);
        Purse.Winner[] memory ws = purse.winnersOf(id);
        assertEq(ws.length, 3);
        assertEq(ws[0].winner, alice);
        assertEq(ws[0].amount, 500e6);
        assertEq(ws[1].winner, bob);
        assertEq(ws[1].amount, 300e6);
        assertEq(ws[2].winner, carol);
        assertEq(ws[2].amount, 200e6);
        assertFalse(ws[0].delivered);
        Purse.PurseView memory v = purse.purse(id);
        assertTrue(v.named);
        assertTrue(v.locked);
        assertEq(v.claimBy, T_START + CLAIM_WINDOW);
        assertEq(v.winnerCount, 3);
        assertEq(v.owed, POOL); // naming leaves owed unchanged
        _deliver(id, bob);
        assertTrue(purse.winnersOf(id)[1].delivered);
        assertFalse(purse.winnersOf(id)[0].delivered);
    }

    function test_Views_PurseCountAndContributionOfUnfunded() public {
        assertEq(purse.purseCount(), 0);
        uint256 id = _create(POOL);
        _create(POOL);
        assertEq(purse.purseCount(), 2);
        assertEq(purse.contributionOf(id, alice), 0);
    }

    // ───────────── unknown ids ─────────────
    function test_UnknownPurse_AllEntryPointsRevert() public {
        _create(POOL);
        bytes memory err = abi.encodeWithSelector(Purse.UnknownPurse.selector, 1);
        vm.expectRevert(err);
        purse.add(1, 1);
        vm.expectRevert(err);
        purse.lock(1);
        vm.expectRevert(err);
        purse.name(1, _a1(alice), _u1(1));
        vm.expectRevert(err);
        purse.deliver(1, alice);
        vm.expectRevert(err);
        purse.refund(1, alice);
        vm.expectRevert(err);
        purse.sweep(1);
        vm.expectRevert(err);
        purse.purse(1);
        vm.expectRevert(err);
        purse.winnersOf(1);
        vm.expectRevert(err);
        purse.contributionOf(1, alice);
    }

    function test_UnknownPurse_WhenNonePurseCreated() public {
        vm.expectRevert(abi.encodeWithSelector(Purse.UnknownPurse.selector, 0));
        purse.purse(0);
    }

    // ───────────── full happy path ─────────────
    function test_HappyPath_CreateNameDeliverByThirdParty() public {
        uint256 id = _create(POOL);
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(relayer.balance, 0);
        _lock(id);

        vm.expectEmit(true, false, false, true, address(purse));
        emit Purse.WinnersNamed(id, _a3(alice, bob, carol), _u3(500e6, 300e6, 200e6), T_START + CLAIM_WINDOW);
        _nameThree(id);

        vm.warp(nameBy + 1 hours);

        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Delivered(id, alice, 500e6, relayer);
        vm.expectEmit(true, true, false, true, address(usdc));
        emit IERC20.Transfer(address(purse), alice, 500e6);
        _deliver(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_owed(id), 500e6);

        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Delivered(id, bob, 300e6, relayer);
        _deliver(id, bob);
        assertEq(_owed(id), 200e6);

        vm.expectEmit(true, true, false, true, address(purse));
        emit Purse.Delivered(id, carol, 200e6, relayer);
        _deliver(id, carol);

        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(usdc.balanceOf(address(purse)), 0);
        assertEq(_owed(id), 0);
        assertEq(purse.purse(id).pool, POOL); // pool unchanged by payouts
    }
}
