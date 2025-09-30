// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title Simple Token Locker (pure timelock)
/// @author Plasmatic Tools
/// @notice Minimal locker: tokens cannot be withdrawn until `lockUntil`. No vesting/cliff.
contract TokenLocker {
    struct LockInfo {
        address token;
        uint256 amount;          // total locked amount
        uint256 withdrawn;       // amount already withdrawn
        uint256 lockUntil;       // end of vesting; all unlocked by this time
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
        uint256 lockUntil
    );

    event Withdrawn(uint256 indexed lockId, address indexed owner, uint256 amount);

    error InvalidParams();
    error NotOwner();
    error NothingToWithdraw();

    /// @notice Lock `amount` of `token` for the caller until `lockUntil`.
    /// @param token ERC20 token address
    /// @param amount amount in token units
    /// @param lockUntil unix timestamp when unlocked
    function lock(address token, uint256 amount, uint256 lockUntil) external {
        if (token == address(0) || amount == 0) revert InvalidParams();
        if (lockUntil <= block.timestamp) revert InvalidParams();

        // Transfer tokens from sender to this contract
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");

        uint256 lockId = ++nextLockId;
        locks[lockId] = LockInfo({
            token: token,
            amount: amount,
            withdrawn: 0,
            lockUntil: lockUntil,
            owner: msg.sender
        });
        ownerLocks[msg.sender].push(lockId);

        emit Locked(lockId, msg.sender, token, amount, lockUntil);
    }

    /// @notice View how much is currently withdrawable for a lock (pure timelock)
    function withdrawable(uint256 lockId) public view returns (uint256) {
        LockInfo memory info = locks[lockId];
        if (info.amount == 0) return 0;

        if (block.timestamp < info.lockUntil) return 0;
        return info.amount - info.withdrawn;
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


