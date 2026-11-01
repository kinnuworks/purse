// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only 6-decimals USDC with a settable per-address blocklist.
/// transfer/transferFrom revert if sender or recipient is blocked.
contract MockUSDC is ERC20 {
    mapping(address => bool) public blocked;

    error Blocked(address account);

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}

/// @dev MockUSDC whose transfers can fire ONE re-entrant low-level call into a target
/// (msg.sender of the re-entrant call is this token). The outcome is recorded.
contract ReentrantUSDC is MockUSDC {
    address public hookTarget;
    bytes public hookData;
    bool public hookFired;
    bool public hookSuccess;
    bytes public hookReturn;

    function arm(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
        hookFired = false;
        hookSuccess = false;
        delete hookReturn;
    }

    function _update(address from, address to, uint256 value) internal override {
        address target = hookTarget;
        if (target != address(0) && from != address(0)) {
            hookTarget = address(0); // single-shot, avoids infinite recursion
            (bool ok, bytes memory ret) = target.call(hookData);
            hookFired = true;
            hookSuccess = ok;
            hookReturn = ret;
        }
        super._update(from, to, value);
    }
}
