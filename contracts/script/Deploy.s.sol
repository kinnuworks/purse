// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Usage:
// USDC_ADDRESS=0x... forge script contracts/script/Deploy.s.sol:DeployPurse --rpc-url <url> --account <keystore> --broadcast

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Purse} from "../Purse.sol";

/// @notice Deploys Purse with an explicitly configured USDC contract.
contract DeployPurse is Script {
    error UsdcAddressZero();
    error UsdcHasNoCode(address usdc);

    /// @notice Validate USDC_ADDRESS and deploy using the signer selected by Forge flags.
    /// @return deployed The newly deployed Purse.
    function run() external returns (Purse deployed) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        if (usdc == address(0)) revert UsdcAddressZero();
        if (usdc.code.length == 0) revert UsdcHasNoCode(usdc);

        vm.startBroadcast();
        deployed = new Purse(usdc);
        vm.stopBroadcast();

        console2.log("Purse deployed at:", address(deployed));
        console2.log("USDC address:", usdc);
    }
}
