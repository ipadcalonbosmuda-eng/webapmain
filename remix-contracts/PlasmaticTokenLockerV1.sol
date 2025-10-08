// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract PlasmaticTokenLockerV1 {
    struct LockInfo {
        address token;
        uint256 amount;
        uint256 withdrawn;
        uint256 lockUntil;
        address owner;
    }

    address public owner;
    address payable public feeRecipient;
    uint256 public feeAmount = 1 ether;

    modifier onlyOwner() {
        require(msg.sender == owner, "OWN");
        _;
    }

    uint256 public nextLockId;
    mapping(uint256 => LockInfo) public locks;
    mapping(address => uint256[]) public ownerLocks;
    mapping(uint256 => uint256) private ownerIndex;

    event Locked(
        uint256 indexed lockId,
        address indexed owner,
        address indexed token,
        uint256 amount,
        uint256 lockUntil
    );
    event Withdrawn(uint256 indexed lockId, address indexed owner, uint256 amount);
    event FeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);

    error InvalidParams();
    error NotOwner();
    error NothingToWithdraw();

    constructor(address payable _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
    }

    function setFeeAmount(uint256 _feeAmount) external onlyOwner {
        feeAmount = _feeAmount;
        emit FeeUpdated(_feeAmount);
    }

    function setFeeRecipient(address payable _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "ZERO");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function lock(address token, uint256 amount, uint256 lockUntil) external payable {
        if (token == address(0) || amount == 0) revert InvalidParams();
        if (lockUntil <= block.timestamp) revert InvalidParams();
        require(msg.value == feeAmount, "FEE");
        if (msg.value > 0) {
            (bool ok, ) = feeRecipient.call{value: msg.value}("");
            require(ok, "FEE_TRANSFER");
        }
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");

        uint256 lockId = ++nextLockId;
        locks[lockId] = LockInfo({
            token: token,
            amount: amount,
            withdrawn: 0,
            lockUntil: lockUntil,
            owner: msg.sender
        });
        ownerIndex[lockId] = ownerLocks[msg.sender].length;
        ownerLocks[msg.sender].push(lockId);

        emit Locked(lockId, msg.sender, token, amount, lockUntil);
    }

    function withdrawable(uint256 lockId) public view returns (uint256) {
        LockInfo memory info = locks[lockId];
        if (info.amount == 0) return 0;
        if (block.timestamp < info.lockUntil) return 0;
        return info.amount - info.withdrawn;
    }

    function withdraw(uint256 lockId) external {
        LockInfo storage info = locks[lockId];
        if (info.owner != msg.sender) revert NotOwner();
        uint256 amountToWithdraw = withdrawable(lockId);
        if (amountToWithdraw == 0) revert NothingToWithdraw();
        info.withdrawn += amountToWithdraw;
        require(IERC20(info.token).transfer(msg.sender, amountToWithdraw), "TRANSFER_FAILED");
        emit Withdrawn(lockId, msg.sender, amountToWithdraw);
        if (info.withdrawn >= info.amount) {
            address ownerAddr = info.owner;
            uint256[] storage list = ownerLocks[ownerAddr];
            uint256 idx = ownerIndex[lockId];
            uint256 lastIdx = list.length - 1;
            if (idx != lastIdx) {
                uint256 lastId = list[lastIdx];
                list[idx] = lastId;
                ownerIndex[lastId] = idx;
            }
            list.pop();
            delete ownerIndex[lockId];
        }
    }

    function locksOf(address _owner) external view returns (uint256[] memory) {
        return ownerLocks[_owner];
    }
}


