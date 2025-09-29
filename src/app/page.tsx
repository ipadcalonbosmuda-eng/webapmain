import Link from 'next/link';
import { ArrowRight, Coins, Lock, Shield, Calendar, Send } from 'lucide-react';

const tools = [
  {
    name: 'Token Creation',
    description: 'Create custom ERC-20 tokens on Plasma Mainnet Beta',
    href: '/tools/create-token',
    icon: Coins,
    color: 'bg-blue-500',
  },
  {
    name: 'Token Locker',
    description: 'Lock your tokens with custom vesting schedules',
    href: '/tools/token-locker',
    icon: Lock,
    color: 'bg-green-500',
  },
  {
    name: 'Liquidity Locker',
    description: 'Secure your LP tokens with time-based locks',
    href: '/tools/liquidity-locker',
    icon: Shield,
    color: 'bg-purple-500',
  },
  {
    name: 'Token Vesting',
    description: 'Create and manage token vesting schedules',
    href: '/tools/vesting',
    icon: Calendar,
    color: 'bg-orange-500',
  },
  {
    name: 'Multi-Send',
    description: 'Send tokens to multiple addresses efficiently',
    href: '/tools/multi-send',
    icon: Send,
    color: 'bg-pink-500',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Plasmatic Tools
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Professional Web3 tools for token creation, locking, vesting, and more on Plasma Mainnet Beta.
            Built for developers, teams, and projects that need reliable blockchain infrastructure.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/tools/create-token"
              className="btn-primary text-lg px-8 py-3 inline-flex items-center justify-center"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <a
              href="https://plasmascan.to"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-lg px-8 py-3 inline-flex items-center justify-center"
            >
              View Explorer
            </a>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Powerful Web3 Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tools.map((tool) => (
              <Link
                key={tool.name}
                href={tool.href}
                className="group card p-6 hover:shadow-lg transition-all duration-200 hover:-translate-y-1"
              >
                <div className={`w-12 h-12 ${tool.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <tool.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-[#00FF85] transition-colors">
                  {tool.name}
                </h3>
                <p className="text-gray-600 group-hover:text-gray-700 transition-colors">
                  {tool.description}
                </p>
                <div className="mt-4 flex items-center text-[#00FF85] font-medium group-hover:translate-x-1 transition-transform">
                  Use Tool
                  <ArrowRight className="ml-1 h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Network Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Built for Plasma Mainnet Beta
          </h3>
          <p className="text-gray-600 mb-6">
            All tools are optimized for the Plasma blockchain network, providing fast transactions and low fees.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <div className="bg-gray-100 px-3 py-1 rounded-full">
              <span className="font-medium">Chain ID:</span> 9745
            </div>
            <div className="bg-gray-100 px-3 py-1 rounded-full">
              <span className="font-medium">Native Token:</span> XPL
            </div>
            <div className="bg-gray-100 px-3 py-1 rounded-full">
              <span className="font-medium">RPC:</span> https://rpc.plasma.to
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}