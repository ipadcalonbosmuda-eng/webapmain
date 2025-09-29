# Plasmatic Tools

A production-ready Web3 Web App built for Plasma Mainnet Beta, providing essential tools for token creation, locking, vesting, and multi-send functionality.

## Features

- **Token Creation**: Deploy custom ERC-20 tokens on Plasma Mainnet Beta
- **Token Locker**: Lock tokens with custom vesting schedules and cliff periods
- **Liquidity Locker**: Secure LP tokens with time-based locks
- **Token Vesting**: Create and manage token vesting schedules
- **Multi-Send**: Send tokens to multiple addresses efficiently
- **Wallet Integration**: RainbowKit for seamless wallet connection
- **Network Management**: Automatic network switching to Plasma Mainnet Beta
- **Responsive Design**: Clean, modern UI optimized for all devices

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Web3**: wagmi + viem + RainbowKit
- **Forms**: React Hook Form + Zod validation
- **Code Quality**: ESLint + Prettier

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- A Web3 wallet (MetaMask, WalletConnect, etc.)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd plasma-webapp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables in Vercel Project Settings → Environment Variables:

```env
NEXT_PUBLIC_CHAIN_ID=9745
NEXT_PUBLIC_RPC=https://rpc.plasma.to
NEXT_PUBLIC_EXPLORER=https://plasmascan.to/
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your-walletconnect-project-id

# Contract addresses (fill with real addresses when ready)
NEXT_PUBLIC_TOKEN_FACTORY=
NEXT_PUBLIC_TOKEN_LOCKER=
NEXT_PUBLIC_LP_LOCKER=
NEXT_PUBLIC_VESTING_FACTORY=
NEXT_PUBLIC_MULTISEND=
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Environment Variables

All environment variables must be prefixed with `NEXT_PUBLIC_` as they are used client-side:

- `NEXT_PUBLIC_CHAIN_ID`: Plasma Mainnet Beta chain ID (9745)
- `NEXT_PUBLIC_RPC`: RPC endpoint for Plasma network
- `NEXT_PUBLIC_EXPLORER`: Block explorer URL for transaction links
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`: WalletConnect project ID for wallet connection
- Contract addresses for each tool (see below)

### Contract Addresses

Replace the placeholder contract addresses with actual deployed contract addresses:

1. **Token Factory** (`NEXT_PUBLIC_TOKEN_FACTORY`): Contract for creating ERC-20 tokens
2. **Token Locker** (`NEXT_PUBLIC_TOKEN_LOCKER`): Contract for locking ERC-20 tokens
3. **Liquidity Locker** (`NEXT_PUBLIC_LP_LOCKER`): Contract for locking LP tokens
4. **Vesting Factory** (`NEXT_PUBLIC_VESTING_FACTORY`): Contract for creating vesting schedules
5. **Multi-Send** (`NEXT_PUBLIC_MULTISEND`): Contract for bulk token transfers

### ABI Configuration

Update the ABI files in `src/lib/abis/` with the actual contract ABIs:

- `tokenFactory.json`
- `tokenLocker.json`
- `liquidityLocker.json`
- `vestingFactory.json`
- `multiSend.json`

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set the environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:

- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## Usage

### Wallet Connection

1. Click "Connect Wallet" in the top-right corner
2. Select your preferred wallet
3. Ensure you're connected to Plasma Mainnet Beta (chain ID: 9745)

### Using the Tools

1. **Token Creation**: Fill in token details and deploy
2. **Token Locker**: Lock tokens with custom parameters
3. **Liquidity Locker**: Secure LP tokens with time locks
4. **Token Vesting**: Create vesting schedules for team members
5. **Multi-Send**: Upload CSV/JSON or manually enter recipients

### File Formats

For Multi-Send, supported formats:

**CSV:**
```csv
address,amount
0x1234...,1000
0x5678...,2000
```

**JSON:**
```json
[
  {"address": "0x1234...", "amount": "1000"},
  {"address": "0x5678...", "amount": "2000"}
]
```

## Network Information

- **Chain ID**: 9745
- **Network Name**: Plasma Mainnet Beta
- **Native Token**: XPL (18 decimals)
- **RPC URL**: https://rpc.plasma.to
- **Explorer**: https://plasmascan.to

## Development

### Code Quality

- ESLint for code linting
- Prettier for code formatting
- TypeScript for type safety

### Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Landing page
│   ├── providers.tsx      # Web3 providers
│   └── tools/             # Tool pages
├── components/            # Reusable components
├── lib/                   # Utilities and configurations
│   ├── abis/             # Contract ABIs
│   ├── chains.ts         # Chain configuration
│   └── utils.ts          # Utility functions
└── styles/               # Global styles
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:

- Create an issue on GitHub
- Check the documentation
- Review the contract ABIs and addresses

## Security

- Always verify contract addresses before use
- Test on testnet before mainnet deployment
- Keep private keys secure
- Review all transactions before confirming

---

Built with ❤️ for the Plasma ecosystem