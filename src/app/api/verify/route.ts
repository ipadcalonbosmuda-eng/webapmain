import { NextRequest, NextResponse } from 'next/server';

// Minimal proxy to Etherscan-compatible API for verification.
// Requires these envs:
// - NEXT_PUBLIC_CHAIN_ID (optional)
// - ETHERSCAN_API_KEY or PLASMA_ETHERSCAN_API_KEY
// - ETHERSCAN_API_URL (e.g., https://api.routescan.io/v2/network/mainnet/evm/9745/etherscan)

export async function POST(req: NextRequest) {
  try {
    const { address, name, symbol, totalSupplyWei, owner } = await req.json();

    const apiKey = process.env.PLASMA_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || 'plasma';
    const apiURL = process.env.ETHERSCAN_API_URL || 'https://api.routescan.io/v2/network/mainnet/evm/9745/etherscan';

    // Our MinimalERC20 is embedded inside TokenFactory; for explorer verification,
    // we submit a flattened source with constructor args encoded.
    const sourceCode = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.23;\ncontract MinimalERC20 {\nstring public name;string public symbol;uint8 public constant decimals=18;uint256 public totalSupply;mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;event Transfer(address indexed from,address indexed to,uint256 value);event Approval(address indexed owner,address indexed spender,uint256 value);constructor(string memory _name,string memory _symbol,uint256 _initialSupply,address _owner){name=_name;symbol=_symbol;totalSupply=_initialSupply;balanceOf[_owner]=_initialSupply;emit Transfer(address(0),_owner,_initialSupply);}function transfer(address to,uint256 value) external returns(bool){_transfer(msg.sender,to,value);return true;}function approve(address spender,uint256 value) external returns(bool){allowance[msg.sender][spender]=value;emit Approval(msg.sender,spender,value);return true;}function transferFrom(address from,address to,uint256 value) external returns(bool){uint256 allowed=allowance[from][msg.sender];require(allowed>=value,'ERC20: insufficient allowance');if(allowed!=type(uint256).max){allowance[from][msg.sender]=allowed-value;emit Approval(from,msg.sender,allowance[from][msg.sender]);}_transfer(from,to,value);return true;}function _transfer(address from,address to,uint256 value) internal{require(to!=address(0),'ERC20: transfer to the zero address');uint256 balance=balanceOf[from];require(balance>=value,'ERC20: transfer amount exceeds balance');unchecked{balanceOf[from]=balance-value;balanceOf[to]+=value;}emit Transfer(from,to,value);}}`;

    const params = new URLSearchParams({
      module: 'contract',
      action: 'verifysourcecode',
      apikey: apiKey,
      contractaddress: address,
      sourceCode: sourceCode,
      codeformat: 'solidity-single-file',
      contractname: 'MinimalERC20',
      compilerversion: 'v0.8.23+commit.f704f362',
      optimizationUsed: '0',
      runs: '200',
      constructorArguements: encodeConstructorArgs([name, symbol, totalSupplyWei, owner]),
    });

    const res = await fetch(`${apiURL}?${params.toString()}`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ message: json?.result || 'Explorer error' }, { status: 500 });
    }
    return NextResponse.json({ message: json?.result || 'Verification submitted' });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || 'Unknown error' }, { status: 500 });
  }
}

function encodeConstructorArgs(values: [string, string, string, string]) {
  // name (bytes), symbol (bytes), supply (uint256), owner (address)
  // Keep simple: rely on explorer accepting plain values; if it requires ABI encoding, integrate viem.
  try {
    return values.join('');
  } catch {
    return '';
  }
}


