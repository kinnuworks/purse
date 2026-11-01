// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Purse} from "../Purse.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Bounded-actor handler driving Purse. This base handler never transfers USDC directly
/// to the Purse (only via create/add, which pull through transferFrom). Records ghost totals.
/// PurseDonorHandler (bottom of file) additionally donates USDC straight to the Purse.
contract PurseHandler is Test {
    Purse public purse;
    MockUSDC public usdc;

    address[] public organisers; // 3
    address[] public sponsors; // 3
    address[] public actors; // organisers + sponsors + 6 dedicated winners (12)

    uint256 public ghostIn; // USDC pulled into the purse by successful create/add
    uint256 public ghostOut; // USDC paid out by successful deliver/refund/sweep
    uint256 public ghostDonated; // USDC sent directly to the Purse (always 0 in this base handler)
    mapping(uint256 => bool) public swept;
    mapping(uint256 => bool) public everLocked;
    mapping(uint256 => uint256) public poolAtLock; // pool recorded when lock() succeeded
    mapping(uint256 => uint256) public namedAt; // block.timestamp of the successful name()

    // call-success counters (coverage visibility)
    uint256 public nCreate;
    uint256 public nAdd;
    uint256 public nLock;
    uint256 public nName;
    uint256 public nDeliver;
    uint256 public nRefund;
    uint256 public nSweep;

    constructor(Purse purse_, MockUSDC usdc_) {
        purse = purse_;
        usdc = usdc_;
        for (uint256 i = 0; i < 3; ++i) {
            organisers.push(makeAddr(string.concat("organiser", vm.toString(i))));
            sponsors.push(makeAddr(string.concat("sponsor", vm.toString(i))));
        }
        for (uint256 i = 0; i < 3; ++i) {
            actors.push(organisers[i]);
            actors.push(sponsors[i]);
        }
        for (uint256 i = 0; i < 6; ++i) {
            actors.push(makeAddr(string.concat("winner", vm.toString(i))));
        }
        for (uint256 i = 0; i < actors.length; ++i) {
            vm.prank(actors[i]);
            usdc.approve(address(purse), type(uint256).max);
        }
    }

    function funders() external view returns (address[] memory f) {
        f = new address[](6);
        for (uint256 i = 0; i < 3; ++i) {
            f[2 * i] = organisers[i];
            f[2 * i + 1] = sponsors[i];
        }
    }

    function _id(uint256 seed) internal view returns (bool ok, uint256 id) {
        uint256 c = purse.purseCount();
        if (c == 0) return (false, 0);
        return (true, seed % c);
    }

    function _mint(address who, uint256 amount) internal returns (bool) {
        if (usdc.blocked(who)) return false;
        usdc.mint(who, amount);
        return true;
    }

    // ───────────── actions ─────────────
    function create(uint256 orgSeed, uint256 amount, uint256 nameDelta, uint256 claimDelta) external {
        address org = organisers[orgSeed % 3];
        amount = bound(amount, 1, 1_000_000e6);
        nameDelta = bound(nameDelta, 1, 3 days);
        claimDelta = bound(claimDelta, 60, 5 days); // claimWindow in seconds (MIN_CLAIM_WINDOW = 60)
        if (!_mint(org, amount)) return;
        uint64 nb = uint64(block.timestamp + nameDelta);
        vm.prank(org);
        try purse.create("p", amount, nb, uint64(claimDelta)) {
            ghostIn += amount;
            nCreate++;
        } catch {}
    }

    function add(uint256 idSeed, uint256 sponsorSeed, uint256 amount) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        address who = sponsorSeed % 4 == 0 ? organisers[sponsorSeed / 4 % 3] : sponsors[sponsorSeed % 3];
        amount = bound(amount, 1, 100_000e6);
        if (!_mint(who, amount)) return;
        vm.prank(who);
        try purse.add(id, amount) {
            ghostIn += amount;
            nAdd++;
        } catch {}
    }

    function lock(uint256 idSeed, uint256 callerSeed) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        // mostly the real organiser, sometimes a random actor
        address caller = callerSeed % 4 == 0 ? actors[callerSeed / 4 % actors.length] : purse.purse(id).organiser;
        uint256 poolNow = purse.purse(id).pool;
        vm.prank(caller);
        try purse.lock(id) {
            everLocked[id] = true;
            poolAtLock[id] = poolNow;
            nLock++;
        } catch {}
    }

    function name(uint256 idSeed, uint256 nSeed, uint256 salt) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        Purse.PurseView memory v = purse.purse(id);
        uint256 n = bound(nSeed, 1, 8);
        if (v.pool == 0) return;
        // usually lock first (naming requires it); sometimes try unlocked to exercise NotLocked
        if (!v.locked && nSeed % 5 != 0) {
            vm.prank(v.organiser);
            try purse.lock(id) {
                everLocked[id] = true;
                poolAtLock[id] = v.pool;
                nLock++;
            } catch {}
        }
        if (n > v.pool) n = v.pool;
        address[] memory w = new address[](n);
        uint256[] memory a = new uint256[](n);
        uint256 remaining = v.pool - n;
        uint256 start = salt % actors.length;
        for (uint256 i = 0; i < n; ++i) {
            w[i] = actors[(start + i) % actors.length];
            uint256 extra = i == n - 1 ? remaining : uint256(keccak256(abi.encode(salt, i))) % (remaining + 1);
            remaining -= extra;
            a[i] = 1 + extra;
        }
        vm.prank(v.organiser);
        try purse.name(id, w, a) {
            namedAt[id] = block.timestamp;
            nName++;
        } catch {}
    }

    function deliver(uint256 idSeed, uint256 winnerSeed, uint256 callerSeed) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        Purse.Winner[] memory ws = purse.winnersOf(id);
        address target;
        uint256 amount;
        if (ws.length > 0 && winnerSeed % 8 != 0) {
            Purse.Winner memory pick = ws[winnerSeed % ws.length];
            target = pick.winner;
            amount = pick.amount;
        } else {
            target = actors[winnerSeed % actors.length]; // possibly a non-winner
            for (uint256 i = 0; i < ws.length; ++i) {
                if (ws[i].winner == target) amount = ws[i].amount;
            }
        }
        vm.prank(actors[callerSeed % actors.length]);
        try purse.deliver(id, target) {
            ghostOut += amount;
            nDeliver++;
        } catch {}
    }

    function refund(uint256 idSeed, uint256 funderSeed) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        address funder = actors[funderSeed % 6];
        uint256 amount = purse.contributionOf(id, funder);
        vm.prank(actors[(funderSeed / 7) % actors.length]);
        try purse.refund(id, funder) {
            ghostOut += amount;
            nRefund++;
        } catch {}
    }

    function sweep(uint256 idSeed, uint256 callerSeed) external {
        (bool ok, uint256 id) = _id(idSeed);
        if (!ok) return;
        uint256 amount = purse.purse(id).owed;
        vm.prank(actors[callerSeed % actors.length]);
        try purse.sweep(id) {
            ghostOut += amount;
            swept[id] = true;
            nSweep++;
        } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }

    function setBlocked(uint256 actorSeed, bool isBlocked) external {
        usdc.setBlocked(actors[actorSeed % actors.length], isBlocked);
    }
}

/// @dev Same actions, plus `donate`: USDC sent straight to the Purse (not via create/add).
contract PurseDonorHandler is PurseHandler {
    constructor(Purse purse_, MockUSDC usdc_) PurseHandler(purse_, usdc_) {}

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 10_000e6);
        usdc.mint(address(this), amount);
        usdc.transfer(address(purse), amount);
        ghostDonated += amount;
    }
}
