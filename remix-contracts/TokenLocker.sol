// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenLocker
 * @dev Contract for locking PRC-20 tokens
 * @author Plasmatic Tools
 */
contract TokenLocker is ReentrancyGuard, Ownable {
    struct LockInfo {
        address token;
        address owner;
        uint256 amount;
        uint256 unlockTime;
        bool isLocked;
        uint256 lockTime;
        string description;
    }

    mapping(uint256 => LockInfo) public locks;
    mapping(address => uint256[]) public userLocks;
    mapping(address => mapping(address => uint256)) public lockedBalances; // user => token => amount

    uint256 public totalLocks;
    uint256 public constant MIN_LOCK_DURATION = 1 days;
    uint256 public constant MAX_LOCK_DURATION = 10 * 365 days; // 10 years

    event TokensLocked(
        uint256 indexed lockId,
        address indexed token,
        address indexed owner,
        uint256 amount,
        uint256 unlockTime,
        string description
    );

    event TokensUnlocked(
        uint256 indexed lockId,
        address indexed token,
        address indexed owner,
        uint256 amount
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Lock tokens
     * @param token Token contract address
     * @param amount Amount to lock
     * @param unlockTime Unix timestamp when tokens can be unlocked
     * @param description Description of the lock
     */
    function lockTokens(
        address token,
        uint256 amount,
        uint256 unlockTime,
        string memory description
    ) external nonReentrant {
        require(token != address(0), "TokenLocker: Invalid token address");
        require(amount > 0, "TokenLocker: Amount must be greater than 0");
        require(unlockTime > block.timestamp, "TokenLocker: Unlock time must be in the future");
        require(
            unlockTime - block.timestamp >= MIN_LOCK_DURATION,
            "TokenLocker: Lock duration too short"
        );
        require(
            unlockTime - block.timestamp <= MAX_LOCK_DURATION,
            "TokenLocker: Lock duration too long"
        );

        IERC20 tokenContract = IERC20(token);

        // Transfer tokens to this contract
        require(
            tokenContract.transferFrom(msg.sender, address(this), amount),
            "TokenLocker: Transfer failed"
        );

        // Create lock
        uint256 lockId = totalLocks++;
        locks[lockId] = LockInfo({
            token: token,
            owner: msg.sender,
            amount: amount,
            unlockTime: unlockTime,
            isLocked: true,
            lockTime: block.timestamp,
            description: description
        });

        userLocks[msg.sender].push(lockId);
        lockedBalances[msg.sender][token] += amount;

        emit TokensLocked(lockId, token, msg.sender, amount, unlockTime, description);
    }

    /**
     * @dev Unlock tokens
     * @param lockId Lock ID to unlock
     */
    function unlockTokens(uint256 lockId) external nonReentrant {
        LockInfo storage lock = locks[lockId];
        require(lock.owner == msg.sender, "TokenLocker: Not the lock owner");
        require(lock.isLocked, "TokenLocker: Lock already unlocked");
        require(block.timestamp >= lock.unlockTime, "TokenLocker: Lock not yet expired");

        IERC20 tokenContract = IERC20(lock.token);

        // Mark as unlocked
        lock.isLocked = false;

        // Update locked balance
        lockedBalances[msg.sender][lock.token] -= lock.amount;

        // Transfer tokens back to owner
        require(
            tokenContract.transfer(msg.sender, lock.amount),
            "TokenLocker: Transfer failed"
        );

        emit TokensUnlocked(lockId, lock.token, msg.sender, lock.amount);
    }

    /**
     * @dev Get user's locks
     * @param user User address
     * @return Array of lock IDs
     */
    function getUserLocks(address user) external view returns (uint256[] memory) {
        return userLocks[user];
    }

    /**
     * @dev Get lock information
     * @param lockId Lock ID
     * @return Lock information
     */
    function getLockInfo(uint256 lockId) external view returns (LockInfo memory) {
        return locks[lockId];
    }

    /**
     * @dev Get user's locked balance for a token
     * @param user User address
     * @param token Token address
     * @return Locked amount
     */
    function getLockedBalance(address user, address token) external view returns (uint256) {
        return lockedBalances[user][token];
    }

    /**
     * @dev Emergency unlock (only owner, for stuck tokens)
     * @param lockId Lock ID
     */
    function emergencyUnlock(uint256 lockId) external onlyOwner {
        LockInfo storage lock = locks[lockId];
        require(lock.isLocked, "TokenLocker: Lock already unlocked");

        lock.isLocked = false;
        lockedBalances[lock.owner][lock.token] -= lock.amount;

        IERC20 tokenContract = IERC20(lock.token);
        require(
            tokenContract.transfer(lock.owner, lock.amount),
            "TokenLocker: Transfer failed"
        );

        emit TokensUnlocked(lockId, lock.token, lock.owner, lock.amount);
    }
}
