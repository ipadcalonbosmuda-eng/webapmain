// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title Simple Token Locker with optional cliff and linear vesting
/// @notice Matches frontend ABI: lock(token, amount, lockUntil, cliff)
/// - Tokens are transferred to this contract and locked until `lockUntil`.
/// - If `cliff` is set (>0), linear vesting starts at `cliff` and ends at `lockUntil`.
/// - If `cliff == 0`, the full amount is withdrawable at `lockUntil`.
contract TokenLocker {
    struct LockInfo {
        address token;
        uint256 amount;          // total locked amount
        uint256 withdrawn;       // amount already withdrawn
        uint256 lockUntil;       // end of vesting; all unlocked by this time
        uint256 cliff;           // start of vesting; 0 means no vesting (all at lockUntil)
        address owner;
    }

    // lockId counter
    uint256 public nextLockId;

    // lockId => LockInfo
    mapping(uint256 => LockInfo) public locks;

    // owner => list of lockIds
    mapping(address => uint256[]) public ownerLocks;

    event Locked(
        uint256 indexed lockId,
        address indexed owner,
        address indexed token,
        uint256 amount,
        uint256 lockUntil,
        uint256 cliff
    );

    event Withdrawn(uint256 indexed lockId, address indexed owner, uint256 amount);

    error InvalidParams();
    error NotOwner();
    error NothingToWithdraw();

    /// @notice Lock `amount` of `token` for the caller
    /// @param token ERC20 token address
    /// @param amount amount in token units
    /// @param lockUntil unix timestamp when fully unlocked
    /// @param cliff unix timestamp when vesting begins (0 for no vesting)
    function lock(address token, uint256 amount, uint256 lockUntil, uint256 cliff) external {
        if (token == address(0) || amount == 0) revert InvalidParams();
        if (lockUntil <= block.timestamp) revert InvalidParams();
        if (cliff > 0 && (cliff >= lockUntil)) revert InvalidParams();

        // Transfer tokens from sender to this contract
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");

        uint256 lockId = ++nextLockId;
        locks[lockId] = LockInfo({
            token: token,
            amount: amount,
            withdrawn: 0,
            lockUntil: lockUntil,
            cliff: cliff,
            owner: msg.sender
        });
        ownerLocks[msg.sender].push(lockId);

        emit Locked(lockId, msg.sender, token, amount, lockUntil, cliff);
    }

    /// @notice View how much is currently withdrawable for a lock
    function withdrawable(uint256 lockId) public view returns (uint256) {
        LockInfo memory info = locks[lockId];
        if (info.amount == 0) return 0;

        // No vesting: 100% available at lockUntil
        if (info.cliff == 0) {
            if (block.timestamp < info.lockUntil) return 0;
            return info.amount - info.withdrawn;
        }

        // Linear vesting between cliff and lockUntil
        if (block.timestamp <= info.cliff) {
            return 0;
        }
        if (block.timestamp >= info.lockUntil) {
            return info.amount - info.withdrawn;
        }

        // Pro-rata unlocked so far
        uint256 vestingDuration = info.lockUntil - info.cliff; // > 0 by validation
        uint256 timeElapsed = block.timestamp - info.cliff;
        uint256 unlocked = (info.amount * timeElapsed) / vestingDuration;
        if (unlocked <= info.withdrawn) return 0;
        return unlocked - info.withdrawn;
    }

    /// @notice Withdraw available tokens for a lock
    function withdraw(uint256 lockId) external {
        LockInfo storage info = locks[lockId];
        if (info.owner != msg.sender) revert NotOwner();

        uint256 amountToWithdraw = withdrawable(lockId);
        if (amountToWithdraw == 0) revert NothingToWithdraw();

        info.withdrawn += amountToWithdraw;
        require(IERC20(info.token).transfer(msg.sender, amountToWithdraw), "TRANSFER_FAILED");

        emit Withdrawn(lockId, msg.sender, amountToWithdraw);
    }

    /// @notice Return list of lock IDs for an owner
    function locksOf(address owner) external view returns (uint256[] memory) {
        return ownerLocks[owner];
    }
}


