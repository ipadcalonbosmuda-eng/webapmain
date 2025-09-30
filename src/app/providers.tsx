'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { plasmaMainnetBeta } from '@/lib/chains';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

function buildConfig() {
  const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  // Use RainbowKit default (WalletConnect) only when a valid project id is provided.
  if (projectId && projectId.length >= 8) {
    try {
      return getDefaultConfig({
        appName: 'Plasmatic Tools',
        projectId,
        chains: [plasmaMainnetBeta],
        ssr: false,
      });
    } catch {
      // fall through to injected-only config
    }
  }

  // Fallback: injected connector only, avoids WalletConnect domain allowlist errors.
  return createConfig({
    chains: [plasmaMainnetBeta],
    connectors: [injected()],
    transports: {
      [plasmaMainnetBeta.id]: http('https://rpc.plasma.to'),
    },
    ssr: false,
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const config = buildConfig();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
