import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Plasmatic Tools - Web3 Tools for Plasma Mainnet Beta',
  description: 'Professional Web3 tools for token creation, locking, vesting, and more on Plasma Mainnet Beta.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50">
            <Header />
            <div className="flex relative">
              <Sidebar />
              <main className="flex-1 lg:ml-64 min-h-screen">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}