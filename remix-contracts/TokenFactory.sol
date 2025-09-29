// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title TokenFactory
 * @dev Factory contract for creating PRC-20 tokens
 * @author Plasmatic Tools
 */
contract TokenFactory is ReentrancyGuard, Ownable {
    struct TokenInfo {
        address tokenAddress;
        string name;
        string symbol;
        uint256 totalSupply;
        uint8 decimals;
        address creator;
        uint256 creationTime;
    }

    mapping(address => TokenInfo[]) public userTokens;
    mapping(address => bool) public isTokenCreated;
    TokenInfo[] public allTokens;

    event TokenCreated(
        address indexed tokenAddress,
        address indexed creator,
        string name,
        string symbol,
        uint256 totalSupply,
        uint8 decimals
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Create a new PRC-20 token
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total supply of tokens
     * @param decimals Number of decimals
     */
    function createToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint8 decimals
    ) external nonReentrant returns (address) {
        require(bytes(name).length > 0, "TokenFactory: Name cannot be empty");
        require(bytes(symbol).length > 0, "TokenFactory: Symbol cannot be empty");
        require(totalSupply > 0, "TokenFactory: Total supply must be greater than 0");
        require(decimals <= 18, "TokenFactory: Decimals cannot exceed 18");

        // Deploy new token contract
        PlasmaticToken newToken = new PlasmaticToken(
            name,
            symbol,
            totalSupply,
            decimals,
            msg.sender
        );

        address tokenAddress = address(newToken);

        // Store token info
        TokenInfo memory tokenInfo = TokenInfo({
            tokenAddress: tokenAddress,
            name: name,
            symbol: symbol,
            totalSupply: totalSupply,
            decimals: decimals,
            creator: msg.sender,
            creationTime: block.timestamp
        });

        userTokens[msg.sender].push(tokenInfo);
        allTokens.push(tokenInfo);
        isTokenCreated[tokenAddress] = true;

        emit TokenCreated(tokenAddress, msg.sender, name, symbol, totalSupply, decimals);

        return tokenAddress;
    }

    /**
     * @dev Get all tokens created by a user
     * @param user User address
     * @return Array of token info
     */
    function getUserTokens(address user) external view returns (TokenInfo[] memory) {
        return userTokens[user];
    }

    /**
     * @dev Get all tokens created
     * @return Array of all token info
     */
    function getAllTokens() external view returns (TokenInfo[] memory) {
        return allTokens;
    }

    /**
     * @dev Get total number of tokens created
     * @return Number of tokens
     */
    function getTotalTokens() external view returns (uint256) {
        return allTokens.length;
    }
}

/**
 * @title PlasmaticToken
 * @dev PRC-20 token implementation
 */
contract PlasmaticToken is ERC20, Ownable {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint8 decimals_,
        address owner
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = decimals_;
        _mint(owner, totalSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint additional tokens (only owner)
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens (only owner)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
