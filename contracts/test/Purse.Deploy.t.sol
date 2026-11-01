// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Purse} from "../Purse.sol";
import {DeployPurse} from "../script/Deploy.s.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Behaviour of the DeployPurse script (and proof it compiles against the current Purse).
/// USDC_ADDRESS is process-global, so every scenario runs sequentially inside ONE test
/// function: forge executes test functions in parallel and would otherwise race on the env var.
contract PurseDeployScriptTest is Test {
    DeployPurse internal script;
    MockUSDC internal usdc;

    function setUp() public {
        script = new DeployPurse();
        usdc = new MockUSDC();
    }

    function test_DeployScript_EnvScenarios() public {
        // 0) unset (only checkable if the host env does not already define it)
        if (!vm.envExists("USDC_ADDRESS")) {
            vm.expectRevert();
            script.run();
        }

        // 1) configured to the mock token -> deploys a Purse bound to it
        vm.setEnv("USDC_ADDRESS", vm.toString(address(usdc)));
        Purse deployed = script.run();
        assertTrue(address(deployed) != address(0));
        assertGt(address(deployed).code.length, 0);
        assertEq(address(deployed.usdc()), address(usdc));
        assertEq(deployed.purseCount(), 0);
        assertEq(deployed.MIN_CLAIM_WINDOW(), 60);

        // 2) zero address -> UsdcAddressZero
        vm.setEnv("USDC_ADDRESS", vm.toString(address(0)));
        vm.expectRevert(DeployPurse.UsdcAddressZero.selector);
        script.run();

        // 3) address with no code (an EOA) -> UsdcHasNoCode(eoa)
        address eoa = makeAddr("not-a-token");
        vm.setEnv("USDC_ADDRESS", vm.toString(eoa));
        vm.expectRevert(abi.encodeWithSelector(DeployPurse.UsdcHasNoCode.selector, eoa));
        script.run();

        // 4) empty / malformed value behaves like unset -> revert
        vm.setEnv("USDC_ADDRESS", "");
        vm.expectRevert();
        script.run();
        vm.setEnv("USDC_ADDRESS", "not-an-address");
        vm.expectRevert();
        script.run();

        // 5) recovers once configured correctly again; deployed Purse is functional end to end
        vm.setEnv("USDC_ADDRESS", vm.toString(address(usdc)));
        Purse again = script.run();
        assertEq(address(again.usdc()), address(usdc));
        usdc.mint(address(this), 10e6);
        usdc.approve(address(again), 10e6);
        uint256 id = again.create("deployed", 10e6, uint64(block.timestamp + 1 days), 60);
        assertEq(again.purse(id).claimWindow, 60);
        assertEq(usdc.balanceOf(address(again)), 10e6);
    }
}
