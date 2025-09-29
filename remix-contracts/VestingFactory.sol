// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingFactory
 * @dev Factory contract for creating token vesting schedules
 * @author Plasmatic Tools
 */
contract VestingFactory is ReentrancyGuard, Ownable {
    struct VestingSchedule {
        address token;
        address beneficiary;
        address creator;
        uint256 totalAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliff;
        bool isActive;
        uint256 released;
        uint256 creationTime;
        string description;
    }

    mapping(uint256 => VestingSchedule) public vestingSchedules;
    mapping(address => uint256[]) public userVestings;
    mapping(address => uint256[]) public beneficiaryVestings;

    uint256 public totalVestings;
    uint256 public constant MIN_VESTING_DURATION = 1 days;
    uint256 public constant MAX_VESTING_DURATION = 10 * 365 days; // 10 years

    event VestingCreated(
        uint256 indexed vestingId,
        address indexed token,
        address indexed beneficiary,
        address creator,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration,
        uint256 cliff,
        string description
    );

    event TokensReleased(
        uint256 indexed vestingId,
        address indexed token,
        address indexed beneficiary,
        uint256 amount
    );

    event VestingRevoked(
        uint256 indexed vestingId,
        address indexed token,
        address indexed beneficiary,
        uint256 revokedAmount
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Create a new vesting schedule
     * @param token Token contract address
     * @param beneficiary Address that will receive the tokens
     * @param totalAmount Total amount to be vested
     * @param startTime Unix timestamp when vesting starts
     * @param duration Vesting duration in seconds
     * @param cliff Cliff period in seconds (tokens are locked until startTime + cliff)
     * @param description Description of the vesting
     */
    function createVesting(
        address token,
        address beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration,
        uint256 cliff,
        string memory description
    ) external nonReentrant {
        require(token != address(0), "VestingFactory: Invalid token address");
        require(beneficiary != address(0), "VestingFactory: Invalid beneficiary address");
        require(totalAmount > 0, "VestingFactory: Total amount must be greater than 0");
        require(duration >= MIN_VESTING_DURATION, "VestingFactory: Duration too short");
        require(duration <= MAX_VESTING_DURATION, "VestingFactory: Duration too long");
        require(cliff <= duration, "VestingFactory: Cliff cannot exceed duration");

        IERC20 tokenContract = IERC20(token);

        // Transfer tokens to this contract
        require(
            tokenContract.transferFrom(msg.sender, address(this), totalAmount),
            "VestingFactory: Transfer failed"
        );

        // Create vesting schedule
        uint256 vestingId = totalVestings++;
        vestingSchedules[vestingId] = VestingSchedule({
            token: token,
            beneficiary: beneficiary,
            creator: msg.sender,
            totalAmount: totalAmount,
            startTime: startTime,
            duration: duration,
            cliff: cliff,
            isActive: true,
            released: 0,
            creationTime: block.timestamp,
            description: description
        });

        userVestings[msg.sender].push(vestingId);
        beneficiaryVestings[beneficiary].push(vestingId);

        emit VestingCreated(
            vestingId,
            token,
            beneficiary,
            msg.sender,
            totalAmount,
            startTime,
            duration,
            cliff,
            description
        );
    }

    /**
     * @dev Release vested tokens
     * @param vestingId Vesting schedule ID
     */
    function releaseVested(uint256 vestingId) external nonReentrant {
        VestingSchedule storage vesting = vestingSchedules[vestingId];
        require(vesting.beneficiary == msg.sender, "VestingFactory: Not the beneficiary");
        require(vesting.isActive, "VestingFactory: Vesting not active");

        uint256 releasableAmount = getReleasableAmount(vestingId);
        require(releasableAmount > 0, "VestingFactory: No tokens to release");

        vesting.released += releasableAmount;

        IERC20 tokenContract = IERC20(vesting.token);
        require(
            tokenContract.transfer(vesting.beneficiary, releasableAmount),
            "VestingFactory: Transfer failed"
        );

        emit TokensReleased(vestingId, vesting.token, vesting.beneficiary, releasableAmount);
    }

    /**
     * @dev Revoke vesting schedule (only creator)
     * @param vestingId Vesting schedule ID
     */
    function revokeVesting(uint256 vestingId) external nonReentrant {
        VestingSchedule storage vesting = vestingSchedules[vestingId];
        require(vesting.creator == msg.sender, "VestingFactory: Not the creator");
        require(vesting.isActive, "VestingFactory: Vesting not active");

        uint256 releasableAmount = getReleasableAmount(vestingId);
        uint256 revokedAmount = vesting.totalAmount - vesting.released - releasableAmount;

        vesting.isActive = false;

        if (releasableAmount > 0) {
            vesting.released += releasableAmount;
            IERC20 tokenContract = IERC20(vesting.token);
            require(
                tokenContract.transfer(vesting.beneficiary, releasableAmount),
                "VestingFactory: Transfer failed"
            );
        }

        if (revokedAmount > 0) {
            IERC20 tokenContract = IERC20(vesting.token);
            require(
                tokenContract.transfer(vesting.creator, revokedAmount),
                "VestingFactory: Transfer failed"
            );
        }

        emit VestingRevoked(vestingId, vesting.token, vesting.beneficiary, revokedAmount);
    }

    /**
     * @dev Get releasable amount for a vesting schedule
     * @param vestingId Vesting schedule ID
     * @return Releasable amount
     */
    function getReleasableAmount(uint256 vestingId) public view returns (uint256) {
        VestingSchedule memory vesting = vestingSchedules[vestingId];
        if (!vesting.isActive) return 0;

        uint256 currentTime = block.timestamp;
        if (currentTime < vesting.startTime + vesting.cliff) {
            return 0; // Still in cliff period
        }

        if (currentTime >= vesting.startTime + vesting.duration) {
            return vesting.totalAmount - vesting.released; // Fully vested
        }

        uint256 elapsed = currentTime - vesting.startTime;
        uint256 vestedAmount = (vesting.totalAmount * elapsed) / vesting.duration;
        return vestedAmount - vesting.released;
    }

    /**
     * @dev Get vested amount for a vesting schedule
     * @param vestingId Vesting schedule ID
     * @return Vested amount
     */
    function getVestedAmount(uint256 vestingId) public view returns (uint256) {
        VestingSchedule memory vesting = vestingSchedules[vestingId];
        if (!vesting.isActive) return vesting.released;

        uint256 currentTime = block.timestamp;
        if (currentTime < vesting.startTime + vesting.cliff) {
            return 0; // Still in cliff period
        }

        if (currentTime >= vesting.startTime + vesting.duration) {
            return vesting.totalAmount; // Fully vested
        }

        uint256 elapsed = currentTime - vesting.startTime;
        return (vesting.totalAmount * elapsed) / vesting.duration;
    }

    /**
     * @dev Get user's vesting schedules
     * @param user User address
     * @return Array of vesting IDs
     */
    function getUserVestings(address user) external view returns (uint256[] memory) {
        return userVestings[user];
    }

    /**
     * @dev Get beneficiary's vesting schedules
     * @param beneficiary Beneficiary address
     * @return Array of vesting IDs
     */
    function getBeneficiaryVestings(address beneficiary) external view returns (uint256[] memory) {
        return beneficiaryVestings[beneficiary];
    }

    /**
     * @dev Get vesting schedule information
     * @param vestingId Vesting schedule ID
     * @return Vesting schedule information
     */
    function getVestingInfo(uint256 vestingId) external view returns (VestingSchedule memory) {
        return vestingSchedules[vestingId];
    }

    /**
     * @dev Emergency withdraw (only owner, for stuck tokens)
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        require(
            tokenContract.transfer(owner(), amount),
            "VestingFactory: Transfer failed"
        );
    }
}
