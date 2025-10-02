'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard,
  Coins, 
  Lock, 
  Shield, 
  Calendar, 
  Send,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

type NavChild = { name: string; href: string };
type NavLink = { name: string; href: string; icon: LucideIcon };
type NavSection = { name: string; icon: LucideIcon; children: NavChild[] };
type NavItem = NavLink | NavSection;

function isNavSection(item: NavItem): item is NavSection {
  return 'children' in item;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Token Creation', href: '/tools/create-token', icon: Coins },
  {
    name: 'Token Locker',
    icon: Lock,
    children: [
      { name: 'Token Lock', href: '/tools/token-locker' },
      { name: 'My Lock', href: '/tools/token-locker/my-lock' },
    ],
  },
  { name: 'Liquidity Locker', href: '/tools/liquidity-locker', icon: Shield },
  {
    name: 'Token Vesting',
    icon: Calendar,
    children: [
      { name: 'Create Vesting', href: '/tools/vesting' },
      { name: 'My Vestings', href: '/tools/vesting/my-vestings' },
    ],
  },
  { name: 'Multi-Send', href: '/tools/multi-send', icon: Send },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // Ensure the section containing the active route is expanded by default
  useEffect(() => {
    navigation.forEach((item) => {
      if ('children' in item && item.children) {
        const anyActive = item.children.some((child) => pathname.startsWith(child.href));
        if (anyActive) {
          setOpenSections((prev) => ({ ...prev, [item.name]: true }));
        }
      }
    });
  }, [pathname]);

  const toggleSection = (name: string) => {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-white border border-gray-200 shadow-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <div className={cn(
        "fixed top-16 left-0 z-40 w-64 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 lg:fixed lg:top-16",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <nav className="flex-1 px-2 space-y-1">
              {navigation.map((item) => {
                if (isNavSection(item)) {
                  const isSectionOpen = !!openSections[item.name];
                  const isSectionActive = item.children.some((child) => pathname.startsWith(child.href));
                  return (
                    <div key={item.name} className="space-y-1">
                      <button
                        type="button"
                        className={cn(
                          'w-full flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                          isSectionActive ? 'bg-[#00FF85] text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        )}
                        onClick={() => toggleSection(item.name)}
                      >
                        <item.icon
                          className={cn(
                            'mr-3 h-5 w-5 flex-shrink-0',
                            isSectionActive ? 'text-black' : 'text-gray-400'
                          )}
                        />
                        <span className="flex-1 text-left">{item.name}</span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isSectionOpen ? 'rotate-180' : 'rotate-0',
                            isSectionActive ? 'text-black' : 'text-gray-400'
                          )}
                        />
                      </button>
                      {isSectionOpen && (
                        <div className="pl-9 space-y-1">
                          {item.children.map((child) => {
                            const isActive = pathname === child.href;
                            return (
                              <Link
                                key={child.name}
                                href={child.href}
                                className={cn(
                                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                                  isActive ? 'bg-[#00FF85] text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                )}
                                onClick={() => setIsOpen(false)}
                              >
                                <span className="mr-3 h-5 w-5" />
                                {child.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Narrow to simple link item
                const link = item as NavLink;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={cn(
                      'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                      isActive
                        ? 'bg-[#00FF85] text-black'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <link.icon
                      className={cn(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        isActive ? 'text-black' : 'text-gray-400 group-hover:text-gray-500'
                      )}
                    />
                    {link.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          {/* Mobile Connect Wallet Button */}
          <div className="lg:hidden px-2 pb-4">
            <div className="border-t border-gray-200 pt-4">
              <ConnectButton />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-transparent lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
