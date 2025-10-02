// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PlasmaticVesting is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidParams();
    error InvalidArrayLength();
    error TooManyRecipients();
    error InvalidSchedule();
    error InvalidCustomSchedule();
    error NotBeneficiary();
    error NothingToRelease();

    struct Schedule {
        address token;
        address beneficiary;
        uint256 totalAmount;
        uint256 released;
        uint64 start;
        uint64 cliffEnd;
        uint64 duration;
        uint64 interval;
        bool isActive;
    }

    struct CustomRelease {
        uint256 timestamp;
        uint256 amount;
        bool claimed;
    }

    uint256 public nextScheduleId;

    mapping(uint256 => Schedule) public schedules;
    mapping(uint256 => CustomRelease[]) public customReleases; // deprecated for step schedules
    mapping(address => uint256[]) public userSchedules;

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed token,
        address indexed beneficiary,
        uint256 totalAmount,
        uint64 start,
        uint64 cliffEnd,
        uint64 duration,
        uint64 interval
    );

    event CustomScheduleCreated(
        uint256 indexed scheduleId,
        address indexed token,
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 start,
        CustomRelease[] releases
    );

    event TokensReleased(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount, uint256 remaining);

    uint256 private constant SECONDS_PER_MONTH = 30 days;
    uint256 public constant DAY = 1 days;
    uint256 public constant WEEK = 7 days;
    uint256 public constant MONTH = 30 days;
    uint256 public constant YEAR = 365 days;
    function createSchedulesEqual(
        address token,
        address[] calldata recipients,
        uint256 totalAmount,
        uint64 cliffSeconds,
        uint64 durationSeconds,
        uint64 intervalSeconds
    ) external {
        if (token == address(0) || totalAmount == 0) revert InvalidParams();
        uint256 n = recipients.length;
        if (n == 0) revert InvalidArrayLength();
        if (n > 20) revert TooManyRecipients();
        if (durationSeconds == 0 || intervalSeconds == 0 || durationSeconds % intervalSeconds != 0) revert InvalidSchedule();

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);
        uint256 baseShare = totalAmount / n;
        uint256 remainder = totalAmount % n;
        uint64 startTs = uint64(block.timestamp);
        uint64 cliffEnd = startTs + cliffSeconds;

        for (uint256 i = 0; i < n; i++) {
            address beneficiary = recipients[i];
            if (beneficiary == address(0)) revert InvalidParams();

            uint256 share = baseShare + (i < remainder ? 1 : 0);
            uint256 id = ++nextScheduleId;
            schedules[id] = Schedule({
                token: token,
                beneficiary: beneficiary,
                totalAmount: share,
                released: 0,
                start: startTs,
                cliffEnd: cliffEnd,
                duration: durationSeconds,
                interval: intervalSeconds,
                isActive: true
            });

            userSchedules[beneficiary].push(id);
            userSchedules[msg.sender].push(id);
            emit ScheduleCreated(id, token, beneficiary, share, startTs, cliffEnd, durationSeconds, intervalSeconds);
        }
    }

    function getCustomReleases(uint256 scheduleId) external view returns (CustomRelease[] memory) {
        return customReleases[scheduleId];
    }

    function getUserSchedules(address user) external view returns (uint256[] memory) {
        return userSchedules[user];
    }

    function getClaimableAmount(uint256 scheduleId) public view returns (uint256) {
        Schedule memory s = schedules[scheduleId];
        if (s.totalAmount == 0 || !s.isActive) return 0;

        if (block.timestamp < s.cliffEnd) return 0;

        uint256 totalSteps = uint256(s.duration) / uint256(s.interval);
        if (totalSteps == 0) return 0;

        uint256 elapsedAfterCliff = uint256(block.timestamp) <= uint256(s.cliffEnd)
            ? 0
            : (uint256(block.timestamp) - uint256(s.cliffEnd));
        uint256 maturedSteps = 1 + (elapsedAfterCliff / uint256(s.interval));
        if (maturedSteps > totalSteps) maturedSteps = totalSteps;

        uint256 basePerStep = s.totalAmount / totalSteps;
        uint256 rem = s.totalAmount % totalSteps;
        uint256 vested = basePerStep * maturedSteps + (maturedSteps < rem ? maturedSteps : rem);
        if (vested <= s.released) return 0;
        return vested - s.released;
    }

    function claim(uint256 scheduleId) external nonReentrant {
        Schedule storage s = schedules[scheduleId];
        if (s.totalAmount == 0) revert InvalidSchedule();
        if (msg.sender != s.beneficiary) revert NotBeneficiary();

        uint256 amount = getClaimableAmount(scheduleId);
        if (amount == 0) revert NothingToRelease();

        s.released += amount;
        if (s.released >= s.totalAmount) {
            s.isActive = false;
        }

        IERC20(s.token).safeTransfer(s.beneficiary, amount);
        emit TokensReleased(scheduleId, s.beneficiary, amount, s.totalAmount - s.released);
    }
}


