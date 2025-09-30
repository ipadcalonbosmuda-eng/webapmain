import { NextRequest, NextResponse } from 'next/server';
import { encodeAbiParameters } from 'viem';

// Minimal proxy to Etherscan-compatible API for verification.
// Requires these envs:
// - NEXT_PUBLIC_CHAIN_ID (optional)
// - ETHERSCAN_API_KEY or PLASMA_ETHERSCAN_API_KEY
// - ETHERSCAN_API_URL (e.g., https://api.routescan.io/v2/network/mainnet/evm/9745/etherscan)

export async function POST(req: NextRequest) {
  try {
    const { address, name, symbol, totalSupplyWei, owner } = await req.json();

    const apiKey = process.env.PLASMA_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || 'plasma';
    const rawApiURL = process.env.ETHERSCAN_API_URL || 'https://api.routescan.io/v2/network/mainnet/evm/9745/etherscan';
    const apiURL = rawApiURL.endsWith('/api') ? rawApiURL : `${rawApiURL.replace(/\/$/, '')}/api`;

    // Our MinimalERC20 is embedded inside TokenFactory; for explorer verification,
    // we submit a flattened source with constructor args encoded.
    const sourceCode = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.23;\ncontract MinimalERC20 {\nstring public name;string public symbol;uint8 public constant decimals=18;uint256 public totalSupply;mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;event Transfer(address indexed from,address indexed to,uint256 value);event Approval(address indexed owner,address indexed spender,uint256 value);constructor(string memory _name,string memory _symbol,uint256 _initialSupply,address _owner){name=_name;symbol=_symbol;totalSupply=_initialSupply;balanceOf[_owner]=_initialSupply;emit Transfer(address(0),_owner,_initialSupply);}function transfer(address to,uint256 value) external returns(bool){_transfer(msg.sender,to,value);return true;}function approve(address spender,uint256 value) external returns(bool){allowance[msg.sender][spender]=value;emit Approval(msg.sender,spender,value);return true;}function transferFrom(address from,address to,uint256 value) external returns(bool){uint256 allowed=allowance[from][msg.sender];require(allowed>=value,'ERC20: insufficient allowance');if(allowed!=type(uint256).max){allowance[from][msg.sender]=allowed-value;emit Approval(from,msg.sender,allowance[from][msg.sender]);}_transfer(from,to,value);return true;}function _transfer(address from,address to,uint256 value) internal{require(to!=address(0),'ERC20: transfer to the zero address');uint256 balance=balanceOf[from];require(balance>=value,'ERC20: transfer amount exceeds balance');unchecked{balanceOf[from]=balance-value;balanceOf[to]+=value;}emit Transfer(from,to,value);}}`;

    const encodedArgs = encodeAbiParameters(
      [
        { type: 'string' },
        { type: 'string' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [name, symbol, BigInt(totalSupplyWei), owner as `0x${string}`]
    ).replace(/^0x/, '');

    async function verifyOnce(optimizationUsed: '0' | '1') {
      const form = new URLSearchParams();
      form.set('module', 'contract');
      form.set('action', 'verifysourcecode');
      form.set('apikey', apiKey);
      form.set('contractaddress', address);
      form.set('sourceCode', sourceCode);
      form.set('codeformat', 'solidity-single-file');
      form.set('contractname', 'MinimalERC20');
      form.set('compilerversion', 'v0.8.23+commit.f704f362');
      form.set('optimizationUsed', optimizationUsed);
      form.set('runs', '200');
      form.set('licenseType', '3'); // MIT
      form.set('language', 'Solidity');
      form.set('constructorArguements', encodedArgs);

      const res = await fetch(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; result?: string; message?: string };
      if (!res.ok || json?.status === '0') {
        return { ok: false as const, message: json?.result || json?.message || 'Explorer error' };
      }
      // json.result should be a GUID
      const guid = json.result as string;
      // poll
      for (let i = 0; i < 6; i++) {
        // throttle to respect free tier limits (<= 2 req/sec)
        await new Promise((r) => setTimeout(r, 3000));
        const qs = new URLSearchParams();
        qs.set('module', 'contract');
        qs.set('action', 'checkverifystatus');
        qs.set('apikey', apiKey);
        qs.set('guid', guid);
        const poll = await fetch(`${apiURL}?${qs.toString()}`, { method: 'GET' });
        const pj = (await poll.json().catch(() => ({}))) as { status?: string; result?: string; message?: string };
        if (pj?.status === '1' && (pj?.result || '').toLowerCase().includes('pass')) {
          return { ok: true as const, message: pj.result || 'Verified' };
        }
        if (pj?.status === '0' && pj?.result && !pj.result.toLowerCase().includes('pending')) {
          return { ok: false as const, message: pj.result };
        }
      }
      return { ok: false as const, message: 'Verification pending. Try again later.' };
    }

    // Helper to detect rate limit text
    const isRateLimited = (m?: string) => (m || '').toLowerCase().includes('limit');

    // Try without optimizer with a few backoff retries when rate limited
    let attempt = await verifyOnce('0');
    for (let i = 0; !attempt.ok && isRateLimited(attempt.message) && i < 2; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      attempt = await verifyOnce('0');
    }
    if (!attempt.ok) {
      // retry with optimizer enabled
      attempt = await verifyOnce('1');
      for (let i = 0; !attempt.ok && isRateLimited(attempt.message) && i < 2; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        attempt = await verifyOnce('1');
      }
    }
    if (attempt.ok) return NextResponse.json({ message: attempt.message });
    return NextResponse.json({ message: attempt.message }, { status: 500 });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ message: err.message || 'Unknown error' }, { status: 500 });
  }
}


