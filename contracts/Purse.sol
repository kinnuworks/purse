// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Purse
/// @notice Public, pre-funded USDC prize pools with permissionless delivery and recovery.
/// @dev Intended for the Arc USDC ERC-20 view; all amounts are raw 6-decimal
/// units (1 USDC = 1_000_000). The constructor must receive the intended USDC address.
/// There is no owner, admin, fee, upgrade, pause, proxy, or rescue mechanism.
/// The absence of pause or admin is deliberate: a discovered flaw requires
/// abandoning the deployment, not pausing it.
/// If the USDC issuer blocklists this contract's address, every purse's payouts,
/// refunds, and sweeps are frozen until the issuer lifts the blocklist;
/// no function here can bypass that restriction.
/// Accounting never reads the USDC balance: obligations derive only from each
/// purse's owed, pool, and contributions. At completed transaction boundaries,
/// the USDC balance is always >= the sum of owed across purses, and is equal
/// when nobody has sent USDC directly. Direct transfers are ignored by accounting
/// and unrecoverable by design. A USDC-blocklisted recipient cannot be delivered
/// or refunded, but their failed transfer cannot block other recipients' calls.
/// Undelivered prizes return to the organiser through sweep at/after claimBy,
/// which is set to time-of-naming + claimWindow;
/// sweeping also requires USDC to permit transfers to the organiser.
///
/// Known limitation: payouts are only to fixed addresses (winner, funder, organiser).
/// If the USDC issuer blocklists the organiser, undelivered prize money that sweep
/// would return to them cannot be transferred and stays locked until the issuer
/// lifts the restriction. Likewise, a blocklisted winner cannot receive their prize
/// before claimBy, and a blocklisted funder cannot receive their refund while the
/// restriction remains. This is accepted by design because there is no admin or
/// alternative destination, and screening at creation cannot prevent later blocklisting.
/// @custom:upgrade-strategy Non-upgradeable and immutable, with no proxy, admin, or migration path.
contract Purse is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Maximum number of winners in one purse.
    uint256 public constant MAX_WINNERS = 50;

    /// @notice Minimum delivery window in seconds, starting when winners are named.
    uint64 public constant MIN_CLAIM_WINDOW = 60;

    /// @notice Immutable USDC ERC-20 used for all funding and payouts.
    IERC20 public immutable usdc;

    struct Winner {
        address winner;
        uint256 amount;
        bool delivered;
    }

    struct PurseData {
        address organiser;
        string title;
        uint64 nameBy;
        uint64 claimWindow;
        uint256 claimBy;
        bool named;
        bool locked;
        uint256 pool;
        uint256 owed;
        Winner[] winners;
        mapping(address => uint256) winnerIndexPlusOne;
        mapping(address => uint256) contributions;
    }

    struct PurseView {
        address organiser;
        string title;
        uint64 nameBy;
        uint64 claimWindow;
        uint256 claimBy;
        bool named;
        bool locked;
        uint256 pool;
        uint256 owed;
        uint256 winnerCount;
    }

    uint256 private _purseCount;
    mapping(uint256 => PurseData) private _purses;

    error UnknownPurse(uint256 id);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDeadlines();
    error ClaimWindowTooShort(uint64 claimWindow, uint64 minimum);
    error NotOrganiser(address caller, address organiser);
    error AlreadyNamed();
    error AlreadyLocked(uint256 id);
    error FundingIsLocked(uint256 id);
    error NotLocked(uint256 id);
    error NamingClosed();
    error LengthMismatch(uint256 winnersLength, uint256 amountsLength);
    error InvalidWinnerCount(uint256 count);
    error DuplicateWinner(address winner);
    error AmountsDoNotMatchPool(uint256 pool, uint256 allocated);
    error NotNamed();
    error ClaimWindowClosed();
    error NotAWinner(address winner);
    error AlreadyDelivered(address winner);
    error RefundNotAvailable();
    error NothingToRefund(address funder);
    error ClaimWindowOpen();
    error NothingToSweep();

    event PurseCreated(
        uint256 indexed id,
        address indexed organiser,
        string title,
        uint256 amount,
        uint64 nameBy,
        uint64 claimWindow
    );
    event Funded(uint256 indexed id, address indexed funder, uint256 amount, uint256 newPool);
    event FundingLocked(uint256 indexed id, uint256 pool);
    event WinnersNamed(uint256 indexed id, address[] winners, uint256[] amounts, uint256 claimBy);
    event Delivered(uint256 indexed id, address indexed winner, uint256 amount, address caller);
    event Refunded(uint256 indexed id, address indexed funder, uint256 amount);
    event Swept(uint256 indexed id, address indexed organiser, uint256 amount, address caller);

    modifier knownPurse(uint256 id) {
        if (id >= _purseCount) revert UnknownPurse(id);
        _;
    }

    /// @notice Select the USDC ERC-20 for the lifetime of the contract.
    /// @param usdc_ Arc USDC ERC-20 view address; cannot be zero.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Create and fund a purse; the caller becomes its organiser.
    /// @dev Requires a USDC allowance. State and logs roll back if funding fails.
    /// The delivery deadline remains zero until winners are named.
    /// @param title Public prize-pool title.
    /// @param amount Initial funding in raw USDC units (6 decimals).
    /// @param nameBy Future, inclusive deadline for funding, locking, and naming.
    /// @param claimWindow Delivery duration in seconds from naming; at least MIN_CLAIM_WINDOW.
    /// @return id Sequential purse identifier, starting at zero.
    function create(string calldata title, uint256 amount, uint64 nameBy, uint64 claimWindow)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (nameBy <= block.timestamp) revert InvalidDeadlines();
        if (claimWindow < MIN_CLAIM_WINDOW) revert ClaimWindowTooShort(claimWindow, MIN_CLAIM_WINDOW);

        id = _purseCount++;
        PurseData storage p = _purses[id];
        p.organiser = msg.sender;
        p.title = title;
        p.nameBy = nameBy;
        p.claimWindow = claimWindow;
        p.pool = amount;
        p.owed = amount;
        p.contributions[msg.sender] = amount;

        emit PurseCreated(id, msg.sender, title, amount, nameBy, claimWindow);
        emit Funded(id, msg.sender, amount, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Add USDC to an unlocked, unnamed purse through its inclusive naming deadline.
    /// @dev Requires a USDC allowance; direct transfers are not contributions.
    /// @param id Existing purse identifier.
    /// @param amount Positive funding amount in raw USDC units.
    function add(uint256 id, uint256 amount) external knownPurse(id) nonReentrant {
        PurseData storage p = _purses[id];
        if (amount == 0) revert ZeroAmount();
        if (p.locked) revert FundingIsLocked(id);
        if (p.named) revert AlreadyNamed();
        if (block.timestamp > p.nameBy) revert NamingClosed();

        p.contributions[msg.sender] += amount;
        p.pool += amount;
        p.owed += amount;

        emit Funded(id, msg.sender, amount, p.pool);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Irrevocably lock funding before naming winners.
    /// @dev The organiser calls lock() to freeze the pool before name(), making
    /// naming immune to last-second donations. Allowed at or before nameBy.
    /// Locking is required for naming; an unnamed purse remains refundable after
    /// nameBy whether or not it was locked.
    /// @param id Existing purse identifier.
    function lock(uint256 id) external knownPurse(id) {
        PurseData storage p = _purses[id];
        if (msg.sender != p.organiser) revert NotOrganiser(msg.sender, p.organiser);
        if (p.locked) revert AlreadyLocked(id);
        if (p.named) revert AlreadyNamed();
        if (block.timestamp > p.nameBy) revert NamingClosed();

        p.locked = true;
        emit FundingLocked(id, p.pool);
    }

    /// @notice Irrevocably allocate the whole locked pool to 1..50 distinct winners.
    /// @dev Only the organiser may name winners, at or before nameBy, after a
    /// separate lock() call. Locking implicitly inside name() would still allow
    /// a front-run add() to change the pool between signing and inclusion and
    /// grief naming; lock and name therefore remain two separate organiser calls.
    /// Naming leaves owed unchanged and sets claimBy to block.timestamp + claimWindow.
    /// Duplicate detection is O(n).
    /// @param id Existing purse identifier.
    /// @param winners Nonzero, distinct prize recipients.
    /// @param amounts Positive raw USDC allocations whose sum equals the pool.
    function name(uint256 id, address[] calldata winners, uint256[] calldata amounts)
        external
        knownPurse(id)
    {
        PurseData storage p = _purses[id];
        if (msg.sender != p.organiser) revert NotOrganiser(msg.sender, p.organiser);
        if (p.named) revert AlreadyNamed();
        if (block.timestamp > p.nameBy) revert NamingClosed();
        if (!p.locked) revert NotLocked(id);
        uint256 count = winners.length;
        if (count != amounts.length) revert LengthMismatch(count, amounts.length);
        if (count == 0 || count > MAX_WINNERS) revert InvalidWinnerCount(count);

        uint256 remaining = p.pool;
        for (uint256 i = 0; i < count; ++i) {
            address recipient = winners[i];
            uint256 amount = amounts[i];
            if (recipient == address(0)) revert ZeroAddress();
            if (amount == 0) revert ZeroAmount();
            if (p.winnerIndexPlusOne[recipient] != 0) revert DuplicateWinner(recipient);
            // Subtracting from the remaining pool also rejects oversized sums
            // with the specified custom error and running allocation context.
            if (amount > remaining) revert AmountsDoNotMatchPool(p.pool, p.pool - remaining + amount);
            remaining -= amount;
            p.winnerIndexPlusOne[recipient] = i + 1;
            p.winners.push(Winner({winner: recipient, amount: amount, delivered: false}));
        }
        if (remaining != 0) revert AmountsDoNotMatchPool(p.pool, p.pool - remaining);
        p.named = true;
        p.claimBy = block.timestamp + p.claimWindow;
        emit WinnersNamed(id, winners, amounts, p.claimBy);
    }

    /// @notice Deliver one prize to its winner, regardless of who calls.
    /// @dev Requires naming and is allowed strictly before the stored claimBy,
    /// set at naming. A failed or blocklisted transfer
    /// reverts the delivered flag and owed reduction, without affecting others.
    /// @param id Existing purse identifier.
    /// @param winner Listed recipient, never replaced with the caller.
    function deliver(uint256 id, address winner) external knownPurse(id) nonReentrant {
        PurseData storage p = _purses[id];
        if (!p.named) revert NotNamed();
        if (block.timestamp >= p.claimBy) revert ClaimWindowClosed();
        uint256 indexPlusOne = p.winnerIndexPlusOne[winner];
        if (indexPlusOne == 0) revert NotAWinner(winner);
        Winner storage prize = p.winners[indexPlusOne - 1];
        if (prize.delivered) revert AlreadyDelivered(winner);

        uint256 amount = prize.amount;
        prize.delivered = true;
        p.owed -= amount;

        emit Delivered(id, winner, amount, msg.sender);
        usdc.safeTransfer(winner, amount);
    }

    /// @notice Refund one funder when the organiser missed the naming deadline.
    /// @dev Anyone may call after nameBy if unnamed, whether locked or unlocked,
    /// but USDC always goes to the funder. Blocklisted or
    /// otherwise failing recipients do not block refunds to other funders.
    /// @param id Existing purse identifier.
    /// @param funder Contributor whose outstanding contribution is returned.
    function refund(uint256 id, address funder) external knownPurse(id) nonReentrant {
        PurseData storage p = _purses[id];
        if (p.named || block.timestamp <= p.nameBy) revert RefundNotAvailable();
        uint256 amount = p.contributions[funder];
        if (amount == 0) revert NothingToRefund(funder);

        p.contributions[funder] = 0;
        p.pool -= amount;
        p.owed -= amount;

        emit Refunded(id, funder, amount);
        usdc.safeTransfer(funder, amount);
    }

    /// @notice Return all undelivered prizes to the organiser at/after the stored claimBy.
    /// @dev Requires naming; claimBy is time-of-naming + claimWindow.
    /// Anyone may call. Uses owed without looping or changing winners'
    /// delivered flags. A failed transfer rolls back the owed reduction.
    /// See the contract-level Known limitation paragraph for issuer blocklisting of fixed recipients.
    /// @param id Existing, named purse identifier.
    function sweep(uint256 id) external knownPurse(id) nonReentrant {
        PurseData storage p = _purses[id];
        if (!p.named || block.timestamp < p.claimBy) revert ClaimWindowOpen();
        uint256 amount = p.owed;
        if (amount == 0) revert NothingToSweep();

        p.owed = 0;

        emit Swept(id, p.organiser, amount, msg.sender);
        usdc.safeTransfer(p.organiser, amount);
    }

    /// @notice Read a purse's public metadata and accounting.
    /// @dev Pool increases on funding and decreases on refunds, not payouts.
    /// Owed tracks remaining obligations and decreases on payout/refund/sweep.
    /// claimWindow is a duration in seconds; claimBy is zero until naming, then
    /// time-of-naming + claimWindow. locked indicates irrevocably frozen funding.
    /// @param id Existing purse identifier.
    /// @return result Metadata, pool, owed, and winner count.
    function purse(uint256 id) external view knownPurse(id) returns (PurseView memory result) {
        PurseData storage p = _purses[id];
        result = PurseView({
            organiser: p.organiser,
            title: p.title,
            nameBy: p.nameBy,
            claimWindow: p.claimWindow,
            claimBy: p.claimBy,
            named: p.named,
            locked: p.locked,
            pool: p.pool,
            owed: p.owed,
            winnerCount: p.winners.length
        });
    }

    /// @notice Read all prize allocations and individual delivery flags.
    /// @dev At most 50 entries. Sweeping does not mark prizes delivered.
    /// @param id Existing purse identifier.
    /// @return winners Stored winners, amounts, and delivery flags.
    function winnersOf(uint256 id) external view knownPurse(id) returns (Winner[] memory winners) {
        return _purses[id].winners;
    }

    /// @notice Read the total number of purses ever created.
    /// @return count Number of valid identifiers; valid ids are [0, count).
    function purseCount() external view returns (uint256 count) {
        return _purseCount;
    }

    /// @notice Read a funder's recorded contributions, less any refund.
    /// @dev Contributions remain recorded after naming, delivery, and sweep;
    /// named purses do not permit contributor refunds.
    /// @param id Existing purse identifier.
    /// @param funder Address whose contribution is requested.
    /// @return amount Recorded raw USDC contribution.
    function contributionOf(uint256 id, address funder)
        external
        view
        knownPurse(id)
        returns (uint256 amount)
    {
        return _purses[id].contributions[funder];
    }
}
