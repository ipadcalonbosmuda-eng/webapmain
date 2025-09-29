'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { plasmaMainnetBeta } from '@/lib/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface RequireWalletProps {
  children: React.ReactNode;
}

export function RequireWallet({ children }: RequireWalletProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-[#00FF85] flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600">
              Connect your wallet to use tools on Plasma Mainnet Beta.
            </p>
          </div>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  if (chainId !== plasmaMainnetBeta.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Wrong Network</h2>
            <p className="text-gray-600 mb-4">
              Please switch to Plasma Mainnet Beta to use these tools.
            </p>
            <button
              onClick={() => switchChain({ chainId: plasmaMainnetBeta.id })}
              className="btn-primary w-full"
            >
              Switch to Plasma Mainnet Beta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
