// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title Plasmatic Token Vesting Factory
/// @notice Minimal vesting schedules with cliff and duration. Supports linear and step (monthly) release.
/// @dev Frontend ABI expects: createSchedule, claimableAmount, claim.
contract VestingFactory {
    enum ReleaseMode { Linear, Step } // 0 = Linear, 1 = Step

    struct Schedule {
        address beneficiary;
        uint256 totalAmount;
        uint256 released;
        uint256 start; // block timestamp when schedule is created
        uint256 cliffMonths; // months before any release happens
        uint256 durationMonths; // total months from start to end
        ReleaseMode mode;
    }

    /// @notice token vested by this factory
    address public immutable token;

    /// @notice incremental id for schedules
    uint256 public nextScheduleId;

    mapping(uint256 => Schedule) public schedules;

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 start,
        uint256 cliffMonths,
        uint256 durationMonths,
        ReleaseMode mode
    );

    event Claimed(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount);

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Invalid token");
        token = tokenAddress;
    }

    // ---------- External API expected by frontend ABI ----------

    /// @notice Create a vesting schedule funded by the caller (requires prior approve)
    /// @param beneficiary Address receiving vested tokens
    /// @param totalAmount Total tokens to vest (token units)
    /// @param cliffMonths Number of months before vesting starts (0 for immediate)
    /// @param durationMonths Total duration in months (must be > cliffMonths)
    /// @param releaseMode 0 = Linear, 1 = Step (monthly)
    function createSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint256 cliffMonths,
        uint256 durationMonths,
        uint8 releaseMode
    ) external returns (uint256 scheduleId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(totalAmount > 0, "Invalid amount");
        require(durationMonths > 0 && durationMonths > cliffMonths, "Invalid duration");
        require(releaseMode <= uint8(ReleaseMode.Step), "Invalid mode");

        // Pull tokens to fund schedule
        require(IERC20(token).transferFrom(msg.sender, address(this), totalAmount), "TRANSFER_FROM_FAILED");

        scheduleId = ++nextScheduleId;
        schedules[scheduleId] = Schedule({
            beneficiary: beneficiary,
            totalAmount: totalAmount,
            released: 0,
            start: block.timestamp,
            cliffMonths: cliffMonths,
            durationMonths: durationMonths,
            mode: ReleaseMode(releaseMode)
        });

        emit ScheduleCreated(scheduleId, beneficiary, totalAmount, block.timestamp, cliffMonths, durationMonths, ReleaseMode(releaseMode));
    }

    /// @notice Return claimable amount for a schedule id
    function claimableAmount(uint256 scheduleId) public view returns (uint256) {
        Schedule memory s = schedules[scheduleId];
        if (s.totalAmount == 0) return 0;

        uint256 vested = _vestedAmount(s);
        if (vested <= s.released) return 0;
        return vested - s.released;
    }

    /// @notice Claim currently vested tokens for a schedule. Only beneficiary can claim.
    function claim(uint256 scheduleId) external {
        Schedule storage s = schedules[scheduleId];
        require(s.totalAmount > 0, "Invalid id");
        require(msg.sender == s.beneficiary, "Not beneficiary");

        uint256 amount = claimableAmount(scheduleId);
        require(amount > 0, "Nothing to claim");

        s.released += amount;
        require(IERC20(token).transfer(s.beneficiary, amount), "TRANSFER_FAILED");
        emit Claimed(scheduleId, s.beneficiary, amount);
    }

    // ---------- Internal helpers ----------

    uint256 private constant SECONDS_PER_MONTH = 30 days; // approximation

    function _vestedAmount(Schedule memory s) internal view returns (uint256) {
        uint256 start = s.start;
        uint256 end = start + s.durationMonths * SECONDS_PER_MONTH;
        uint256 cliffTime = start + s.cliffMonths * SECONDS_PER_MONTH;
        uint256 total = s.totalAmount;

        if (block.timestamp < cliffTime) {
            return 0;
        }

        if (block.timestamp >= end) {
            return total;
        }

        if (s.mode == ReleaseMode.Linear) {
            // Linear from cliff to end
            uint256 linearDuration = end - cliffTime; // > 0 ensured by require
            uint256 timeInto = block.timestamp - cliffTime;
            return (total * timeInto) / linearDuration;
        } else {
            // Step monthly: discrete equal steps after cliff
            uint256 elapsedMonths = (block.timestamp - start) / SECONDS_PER_MONTH;
            if (elapsedMonths <= s.cliffMonths) {
                return 0;
            }
            uint256 vestedMonths = elapsedMonths - s.cliffMonths;
            uint256 totalVestingMonths = s.durationMonths - s.cliffMonths; // > 0
            if (vestedMonths > totalVestingMonths) vestedMonths = totalVestingMonths;
            return (total * vestedMonths) / totalVestingMonths;
        }
    }
}


