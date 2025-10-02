// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract PlasmaticVesting {

    error InvalidParams();
    error InvalidSchedule();
    error InvalidCustomSchedule();
    error NotBeneficiary();
    error NothingToRelease();
    error TransferFailed();

    struct Schedule {
        address token;
        address beneficiary;
        uint256 totalAmount;
        uint256 released;
        uint256 start;
        uint256 cliffMonths;
        uint256 durationMonths;
        bool isActive;
    }

    struct CustomRelease {
        uint256 timestamp;
        uint256 amount;
        bool claimed;
    }

    uint256 public nextScheduleId;

    mapping(uint256 => Schedule) public schedules;
    mapping(uint256 => CustomRelease[]) public customReleases;
    mapping(address => uint256[]) public userSchedules;

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed token,
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 start,
        uint256 cliffMonths,
        uint256 durationMonths
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

    function createSchedule(
        address token,
        address beneficiary,
        uint256 totalAmount,
        uint256 cliffMonths,
        uint256 durationMonths,
        CustomRelease[] calldata customReleases_
    ) external returns (uint256 scheduleId) {
        if (token == address(0) || beneficiary == address(0) || totalAmount == 0) revert InvalidParams();

        if (customReleases_.length == 0) {
            if (durationMonths == 0 || durationMonths <= cliffMonths) revert InvalidSchedule();
        } else {
            uint256 sum;
            uint256 previousTs;
            for (uint256 i = 0; i < customReleases_.length; i++) {
                CustomRelease calldata r = customReleases_[i];
                if (r.claimed) revert InvalidCustomSchedule();
                if (i > 0 && r.timestamp <= previousTs) revert InvalidCustomSchedule();
                previousTs = r.timestamp;
                sum += r.amount;
            }
            if (sum != totalAmount) revert InvalidCustomSchedule();
        }

        if (!IERC20(token).transferFrom(msg.sender, address(this), totalAmount)) revert TransferFailed();

        scheduleId = ++nextScheduleId;
        schedules[scheduleId] = Schedule({
            token: token,
            beneficiary: beneficiary,
            totalAmount: totalAmount,
            released: 0,
            start: block.timestamp,
            cliffMonths: cliffMonths,
            durationMonths: durationMonths,
            isActive: true
        });

        userSchedules[msg.sender].push(scheduleId);
        userSchedules[beneficiary].push(scheduleId);

        if (customReleases_.length == 0) {
            emit ScheduleCreated(
                scheduleId,
                token,
                beneficiary,
                totalAmount,
                block.timestamp,
                cliffMonths,
                durationMonths
            );
        } else {
            for (uint256 i = 0; i < customReleases_.length; i++) {
                customReleases[scheduleId].push(
                    CustomRelease({ timestamp: customReleases_[i].timestamp, amount: customReleases_[i].amount, claimed: false })
                );
            }
            emit CustomScheduleCreated(scheduleId, token, beneficiary, totalAmount, block.timestamp, customReleases[scheduleId]);
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

        if (customReleases[scheduleId].length > 0) {
            uint256 claimable;
            CustomRelease[] memory rs = customReleases[scheduleId];
            for (uint256 i = 0; i < rs.length; i++) {
                if (!rs[i].claimed && rs[i].timestamp <= block.timestamp) {
                    claimable += rs[i].amount;
                }
            }
            return claimable;
        }

        uint256 start = s.start;
        uint256 cliffTime = start + s.cliffMonths * SECONDS_PER_MONTH;
        uint256 end = start + s.durationMonths * SECONDS_PER_MONTH;
        if (block.timestamp < cliffTime) return 0;
        if (block.timestamp >= end) return s.totalAmount - s.released;

        // Always linear for standard schedules
        uint256 linearDuration = end - cliffTime;
        uint256 timeInto = block.timestamp - cliffTime;
        uint256 vested = (s.totalAmount * timeInto) / linearDuration;
        if (vested <= s.released) return 0;
        return vested - s.released;
    }

    function claim(uint256 scheduleId) external {
        Schedule storage s = schedules[scheduleId];
        if (s.totalAmount == 0) revert InvalidSchedule();
        if (msg.sender != s.beneficiary) revert NotBeneficiary();

        uint256 amount;
        if (customReleases[scheduleId].length > 0) {
            CustomRelease[] storage rs = customReleases[scheduleId];
            for (uint256 i = 0; i < rs.length; i++) {
                if (!rs[i].claimed && rs[i].timestamp <= block.timestamp) {
                    rs[i].claimed = true;
                    amount += rs[i].amount;
                }
            }
        } else {
            amount = getClaimableAmount(scheduleId);
            s.released += amount;
        }

        if (amount == 0) revert NothingToRelease();

        if (!IERC20(s.token).transfer(s.beneficiary, amount)) revert TransferFailed();

        if (s.released + amount >= s.totalAmount) {
            s.isActive = false;
        }
        emit TokensReleased(scheduleId, s.beneficiary, amount, s.totalAmount - (s.released + amount));
    }
}


