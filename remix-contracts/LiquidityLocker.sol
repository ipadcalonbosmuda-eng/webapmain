// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LiquidityLocker
 * @dev Contract for locking LP tokens (Liquidity Provider tokens)
 * @author Plasmatic Tools
 */
contract LiquidityLocker is ReentrancyGuard, Ownable {
    struct LiquidityLock {
        address lpToken;
        address owner;
        uint256 amount;
        uint256 unlockTime;
        bool isLocked;
        uint256 lockTime;
        string description;
        address token0;
        address token1;
    }

    mapping(uint256 => LiquidityLock) public liquidityLocks;
    mapping(address => uint256[]) public userLocks;
    mapping(address => mapping(address => uint256)) public lockedLPBalances; // user => lpToken => amount

    uint256 public totalLocks;
    uint256 public constant MIN_LOCK_DURATION = 1 days;
    uint256 public constant MAX_LOCK_DURATION = 10 * 365 days; // 10 years

    event LiquidityLocked(
        uint256 indexed lockId,
        address indexed lpToken,
        address indexed owner,
        uint256 amount,
        uint256 unlockTime,
        address token0,
        address token1,
        string description
    );

    event LiquidityUnlocked(
        uint256 indexed lockId,
        address indexed lpToken,
        address indexed owner,
        uint256 amount
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Lock LP tokens
     * @param lpToken LP token contract address
     * @param amount Amount to lock
     * @param unlockTime Unix timestamp when tokens can be unlocked
     * @param token0 First token in the pair
     * @param token1 Second token in the pair
     * @param description Description of the lock
     */
    function lockLiquidity(
        address lpToken,
        uint256 amount,
        uint256 unlockTime,
        address token0,
        address token1,
        string memory description
    ) external nonReentrant {
        require(lpToken != address(0), "LiquidityLocker: Invalid LP token address");
        require(amount > 0, "LiquidityLocker: Amount must be greater than 0");
        require(unlockTime > block.timestamp, "LiquidityLocker: Unlock time must be in the future");
        require(
            unlockTime - block.timestamp >= MIN_LOCK_DURATION,
            "LiquidityLocker: Lock duration too short"
        );
        require(
            unlockTime - block.timestamp <= MAX_LOCK_DURATION,
            "LiquidityLocker: Lock duration too long"
        );
        require(token0 != address(0), "LiquidityLocker: Invalid token0 address");
        require(token1 != address(0), "LiquidityLocker: Invalid token1 address");

        IERC20 lpTokenContract = IERC20(lpToken);

        // Transfer LP tokens to this contract
        require(
            lpTokenContract.transferFrom(msg.sender, address(this), amount),
            "LiquidityLocker: Transfer failed"
        );

        // Create lock
        uint256 lockId = totalLocks++;
        liquidityLocks[lockId] = LiquidityLock({
            lpToken: lpToken,
            owner: msg.sender,
            amount: amount,
            unlockTime: unlockTime,
            isLocked: true,
            lockTime: block.timestamp,
            description: description,
            token0: token0,
            token1: token1
        });

        userLocks[msg.sender].push(lockId);
        lockedLPBalances[msg.sender][lpToken] += amount;

        emit LiquidityLocked(
            lockId,
            lpToken,
            msg.sender,
            amount,
            unlockTime,
            token0,
            token1,
            description
        );
    }

    /**
     * @dev Unlock LP tokens
     * @param lockId Lock ID to unlock
     */
    function unlockLiquidity(uint256 lockId) external nonReentrant {
        LiquidityLock storage lock = liquidityLocks[lockId];
        require(lock.owner == msg.sender, "LiquidityLocker: Not the lock owner");
        require(lock.isLocked, "LiquidityLocker: Lock already unlocked");
        require(block.timestamp >= lock.unlockTime, "LiquidityLocker: Lock not yet expired");

        IERC20 lpTokenContract = IERC20(lock.lpToken);

        // Mark as unlocked
        lock.isLocked = false;

        // Update locked balance
        lockedLPBalances[msg.sender][lock.lpToken] -= lock.amount;

        // Transfer LP tokens back to owner
        require(
            lpTokenContract.transfer(msg.sender, lock.amount),
            "LiquidityLocker: Transfer failed"
        );

        emit LiquidityUnlocked(lockId, lock.lpToken, msg.sender, lock.amount);
    }

    /**
     * @dev Get user's liquidity locks
     * @param user User address
     * @return Array of lock IDs
     */
    function getUserLocks(address user) external view returns (uint256[] memory) {
        return userLocks[user];
    }

    /**
     * @dev Get liquidity lock information
     * @param lockId Lock ID
     * @return Liquidity lock information
     */
    function getLockInfo(uint256 lockId) external view returns (LiquidityLock memory) {
        return liquidityLocks[lockId];
    }

    /**
     * @dev Get user's locked LP balance for a token
     * @param user User address
     * @param lpToken LP token address
     * @return Locked amount
     */
    function getLockedLPBalance(address user, address lpToken) external view returns (uint256) {
        return lockedLPBalances[user][lpToken];
    }

    /**
     * @dev Get all active locks for a specific LP token
     * @param lpToken LP token address
     * @return Array of active lock IDs
     */
    function getActiveLocksForToken(address lpToken) external view returns (uint256[] memory) {
        uint256[] memory activeLocks = new uint256[](totalLocks);
        uint256 count = 0;

        for (uint256 i = 0; i < totalLocks; i++) {
            if (liquidityLocks[i].lpToken == lpToken && liquidityLocks[i].isLocked) {
                activeLocks[count] = i;
                count++;
            }
        }

        // Resize array to actual count
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeLocks[i];
        }

        return result;
    }

    /**
     * @dev Emergency unlock (only owner, for stuck tokens)
     * @param lockId Lock ID
     */
    function emergencyUnlock(uint256 lockId) external onlyOwner {
        LiquidityLock storage lock = liquidityLocks[lockId];
        require(lock.isLocked, "LiquidityLocker: Lock already unlocked");

        lock.isLocked = false;
        lockedLPBalances[lock.owner][lock.lpToken] -= lock.amount;

        IERC20 lpTokenContract = IERC20(lock.lpToken);
        require(
            lpTokenContract.transfer(lock.owner, lock.amount),
            "LiquidityLocker: Transfer failed"
        );

        emit LiquidityUnlocked(lockId, lock.lpToken, lock.owner, lock.amount);
    }
}
