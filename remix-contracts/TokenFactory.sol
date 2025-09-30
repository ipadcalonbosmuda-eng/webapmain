// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title TokenFactory for Plasma (EVM-compatible)
 * @notice Deploys minimal ERC-20 tokens with 18 decimals and mints supply to owner.
 * @author Plasmatic Tools
 * @custom:website https://plasmatic.tools
 * @custom:license MIT
 *
 * Details:
 * - Minimal ERC20 implementation with owner mint in constructor
 * - Factory can deploy new tokens with desired name, symbol, totalSupply, owner
 * - Returns address of newly deployed token
 * - Uses 18 decimals by default
 */

contract MinimalERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply, address _owner) {
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply;
        balanceOf[_owner] = _initialSupply;
        emit Transfer(address(0), _owner, _initialSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "ERC20: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ERC20: transfer to the zero address");
        uint256 balance = balanceOf[from];
        require(balance >= value, "ERC20: transfer amount exceeds balance");
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

contract TokenFactory {
    /// @notice Project/author attribution
    string public constant AUTHOR = "Plasmatic Tools";
    string public constant VERSION = "1.0.0";

    event TokenCreated(address indexed token, address indexed owner, string name, string symbol, uint256 totalSupply);

    // Creates a new ERC20 with 18 decimals and mints totalSupply to owner
    function createToken(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address owner_
    ) external returns (address token) {
        require(bytes(name_).length > 0, "name required");
        require(bytes(symbol_).length >= 2 && bytes(symbol_).length <= 6, "symbol 2-6 chars");
        require(owner_ != address(0), "owner required");
        require(totalSupply_ > 0, "supply > 0");

        token = address(new MinimalERC20(name_, symbol_, totalSupply_, owner_));
        emit TokenCreated(token, owner_, name_, symbol_, totalSupply_);
    }
}


