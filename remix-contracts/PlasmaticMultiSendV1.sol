// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract PlasmaticMultiSendV1 {
    address public owner;
    address payable public feeRecipient;
    uint256 public feeAmount = 1 ether;

    modifier onlyOwner() {
        require(msg.sender == owner, "OWN");
        _;
    }

    event FeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);
    event MultiSendNative(address indexed sender, uint256 recipientCount, uint256 totalAmount);
    event MultiSendToken(address indexed sender, address indexed token, uint256 recipientCount, uint256 totalAmount);

    error InvalidParams();
    error NotOwner();

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

    function multiSendNative(address[] calldata recipients, uint256[] calldata amounts) external payable {
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidParams();
        require(msg.value >= feeAmount, "FEE");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(msg.value >= totalAmount + feeAmount, "INSUFFICIENT");
        
        if (feeAmount > 0) {
            (bool ok, ) = feeRecipient.call{value: feeAmount}("");
            require(ok, "FEE_TRANSFER");
        }
        
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: amounts[i]}("");
            require(success, "TRANSFER_FAILED");
        }
        
        emit MultiSendNative(msg.sender, recipients.length, totalAmount);
    }

    function multiSend(address[] calldata recipients, uint256[] calldata amounts) external payable {
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidParams();
        require(msg.value >= feeAmount, "FEE");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(msg.value >= totalAmount + feeAmount, "INSUFFICIENT");
        
        if (feeAmount > 0) {
            (bool ok, ) = feeRecipient.call{value: feeAmount}("");
            require(ok, "FEE_TRANSFER");
        }
        
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: amounts[i]}("");
            require(success, "TRANSFER_FAILED");
        }
        
        emit MultiSendNative(msg.sender, recipients.length, totalAmount);
    }

    function multiSendToken(address token, address[] calldata recipients, uint256[] calldata amounts) external payable {
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidParams();
        require(msg.value == feeAmount, "FEE");
        
        if (feeAmount > 0) {
            (bool ok, ) = feeRecipient.call{value: feeAmount}("");
            require(ok, "FEE_TRANSFER");
        }
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(IERC20(token).transferFrom(msg.sender, address(this), totalAmount), "TRANSFER_FROM_FAILED");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(IERC20(token).transfer(recipients[i], amounts[i]), "TRANSFER_FAILED");
        }
        
        emit MultiSendToken(msg.sender, token, recipients.length, totalAmount);
    }
}
