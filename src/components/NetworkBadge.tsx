'use client';

import { useChainId } from 'wagmi';
import { plasmaMainnetBeta } from '@/lib/chains';

export function NetworkBadge() {
  const chainId = useChainId();
  const isCorrectChain = chainId === plasmaMainnetBeta.id;

  return (
    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
      isCorrectChain 
        ? 'bg-green-100 text-green-800 border border-green-200' 
        : 'bg-red-100 text-red-800 border border-red-200'
    }`}>
      {isCorrectChain ? (
        `Plasma Mainnet Beta • ${plasmaMainnetBeta.id}`
      ) : (
        'Wrong Network'
      )}
    </div>
  );
}
