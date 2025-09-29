// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MultiSend
 * @dev Contract for sending native tokens (XPL) and PRC-20 tokens to multiple recipients
 * @author Plasmatic Tools
 */
contract MultiSend is ReentrancyGuard, Ownable {
    event MultiSendNative(address indexed sender, address[] recipients, uint256[] amounts, uint256 totalAmount);
    event MultiSendToken(address indexed sender, address indexed token, address[] recipients, uint256[] amounts);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Send native tokens (XPL) to multiple recipients
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to send to each recipient
     */
    function multiSendNative(address[] calldata recipients, uint256[] calldata amounts) 
        external 
        payable 
        nonReentrant 
    {
        require(recipients.length == amounts.length, "MultiSend: Arrays length mismatch");
        require(recipients.length > 0, "MultiSend: No recipients");
        require(recipients.length <= 200, "MultiSend: Too many recipients"); // Gas limit protection
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "MultiSend: Amount must be greater than 0");
            require(recipients[i] != address(0), "MultiSend: Invalid recipient address");
            totalAmount += amounts[i];
        }
        
        require(msg.value >= totalAmount, "MultiSend: Insufficient value sent");
        
        // Send tokens to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = payable(recipients[i]).call{value: amounts[i]}("");
            require(success, "MultiSend: Transfer failed");
        }
        
        // Return excess ETH to sender
        if (msg.value > totalAmount) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - totalAmount}("");
            require(success, "MultiSend: Refund failed");
        }
        
        emit MultiSendNative(msg.sender, recipients, amounts, totalAmount);
    }
    
    /**
     * @dev Send PRC-20 tokens to multiple recipients
     * @param token Address of the PRC-20 token contract
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to send to each recipient
     */
    function multiSendToken(address token, address[] calldata recipients, uint256[] calldata amounts) 
        external 
        nonReentrant 
    {
        require(recipients.length == amounts.length, "MultiSend: Arrays length mismatch");
        require(recipients.length > 0, "MultiSend: No recipients");
        require(recipients.length <= 200, "MultiSend: Too many recipients"); // Gas limit protection
        require(token != address(0), "MultiSend: Invalid token address");
        
        IERC20 tokenContract = IERC20(token);
        
        // Calculate total amount needed
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "MultiSend: Amount must be greater than 0");
            require(recipients[i] != address(0), "MultiSend: Invalid recipient address");
            totalAmount += amounts[i];
        }
        
        // Check allowance
        require(tokenContract.allowance(msg.sender, address(this)) >= totalAmount, "MultiSend: Insufficient allowance");
        
        // Transfer tokens to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            require(tokenContract.transferFrom(msg.sender, recipients[i], amounts[i]), "MultiSend: Transfer failed");
        }
        
        emit MultiSendToken(msg.sender, token, recipients, amounts);
    }
    
    /**
     * @dev Emergency function to withdraw stuck tokens (only owner)
     * @param token Address of the token to withdraw (address(0) for native tokens)
     */
    function emergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) {
            // Withdraw native tokens
            uint256 balance = address(this).balance;
            if (balance > 0) {
                (bool success, ) = payable(owner()).call{value: balance}("");
                require(success, "MultiSend: Withdraw failed");
            }
        } else {
            // Withdraw PRC-20 tokens
            IERC20 tokenContract = IERC20(token);
            uint256 balance = tokenContract.balanceOf(address(this));
            if (balance > 0) {
                require(tokenContract.transfer(owner(), balance), "MultiSend: Token withdraw failed");
            }
        }
    }
    
    /**
     * @dev Receive function to accept native tokens
     */
    receive() external payable {}
}
