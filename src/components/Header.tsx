'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img src="/logo.svg" alt="Plasmatic" className="h-14 w-auto" />
            </Link>
          </div>
          
          {/* Desktop: Connect Button */}
          <div className="hidden lg:flex items-center space-x-4">
            <ConnectButton />
          </div>

          {/* Mobile: Menu Button */}
          <button
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="fixed top-0 left-0 h-full w-1/2 bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <img src="/logo.svg" alt="Plasmatic" className="h-10 w-auto" />
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-md hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Menu Content */}
              <div className="flex-1 p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Navigation
                    </h3>
                    <nav className="space-y-2">
                      <Link
                        href="/"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/tools/create-token"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Create Token
                      </Link>
                      <Link
                        href="/tools/token-locker"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Token Locker
                      </Link>
                      <Link
                        href="/tools/liquidity-locker"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Liquidity Locker
                      </Link>
                      <Link
                        href="/tools/vesting"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Token Vesting
                      </Link>
                      <Link
                        href="/tools/multi-send"
                        className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Multi-Send
                      </Link>
                    </nav>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Wallet
                    </h3>
                    <div className="px-3">
                      <ConnectButton />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
