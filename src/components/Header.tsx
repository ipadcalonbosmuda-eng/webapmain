'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { NetworkBadge } from './NetworkBadge';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo.svg" alt="Plasmatic" width={32} height={32} priority />
          </Link>
        </div>
        
        <div className="flex items-center space-x-4">
          <NetworkBadge />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
