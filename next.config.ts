import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/dasboard', destination: '/' },
      { source: '/create-token', destination: '/tools/create-token' },
      { source: '/token-locker/token-lock', destination: '/tools/token-locker/token-lock' },
      { source: '/token-locker/my-lock', destination: '/tools/token-locker/my-lock' },
      { source: '/liquidity-locker', destination: '/tools/liquidity-locker' },
      { source: '/token-vesting/create-vesting', destination: '/tools/vesting' },
      { source: '/token-vesting/my-vesting', destination: '/tools/vesting/my-vestings' },
      { source: '/multi-send', destination: '/tools/multi-send' },
    ];
  },
};

export default nextConfig;
