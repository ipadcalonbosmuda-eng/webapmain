'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import vestingAbi from '@/lib/abis/vestingFactory.json';
import { formatUnits } from 'viem';

type Schedule = {
  token: `0x${string}`;
  beneficiary: `0x${string}`;
  totalAmount: bigint;
  released: bigint;
  start: bigint;
  cliffMonths: bigint; // legacy in ABI, ignored for display
  durationMonths: bigint; // legacy in ABI, ignored for display
  mode?: number;
  isActive: boolean;
};

export default function MyVestingsPage() {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const [decimalsMap, setDecimalsMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { data: ids } = useReadContract({
    address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
    abi: vestingAbi,
    functionName: 'getUserSchedules',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!process.env.NEXT_PUBLIC_VESTING_FACTORY },
  });

  const scheduleIds = (ids as unknown as bigint[]) ?? [];

  const { data: firstSchedule } = useReadContract({
    address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
    abi: vestingAbi,
    functionName: 'schedules',
    args: scheduleIds.length ? [scheduleIds[0]] : undefined,
    query: { enabled: scheduleIds.length > 0 },
  });

  // Lazy fetch per schedule (simple version)
  const [schedules, setSchedules] = useState<Array<{ id: bigint; s: Schedule }>>([]);
  useEffect(() => {
    if (scheduleIds.length === 0) {
      setSchedules([]);
      return;
    }
    
    let isMounted = true;
    
    (async () => {
      const newSchedules: Array<{ id: bigint; s: Schedule }> = [];
      
      for (const id of scheduleIds) {
        if (!isMounted) break;
        
        try {
          const res = await (window as unknown as { wagmi?: { readContract?: (p: { address: string; abi: unknown; functionName: string; args: unknown[] }) => Promise<unknown> } }).wagmi?.readContract?.({
            address: process.env.NEXT_PUBLIC_VESTING_FACTORY as string,
            abi: vestingAbi as unknown,
            functionName: 'schedules',
            args: [id as unknown as bigint],
          });
          if (res && isMounted) {
            newSchedules.push({ id, s: res as Schedule });
          }
        } catch {
          // ignore
        }
      }
      
      if (isMounted) {
        setSchedules(newSchedules);
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, [scheduleIds]);

  // Helper to read decimals per token lazily
  useEffect(() => {
    if (schedules.length === 0) return;
    
    (async () => {
      const newDecimalsMap: Record<string, number> = {};
      
      for (const { s } of schedules) {
        const key = s.token.toLowerCase();
        if (decimalsMap[key] !== undefined) continue;
        
        try {
          const dec = await (window as unknown as { wagmi?: { readContract?: (p: { address: string; abi: unknown; functionName: string }) => Promise<unknown> } }).wagmi?.readContract?.({
            address: s.token as unknown as string,
            abi: [{ inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' }] as unknown,
            functionName: 'decimals',
          });
          newDecimalsMap[key] = Number(dec ?? 18);
        } catch {
          newDecimalsMap[key] = 18;
        }
      }
      
      if (Object.keys(newDecimalsMap).length > 0) {
        setDecimalsMap((m) => ({ ...m, ...newDecimalsMap }));
      }
    })();
  }, [schedules.length]); // Only depend on schedules.length to prevent infinite loop

  const claim = async (id: bigint) => {
    try {
      setIsLoading(true);
      await writeContract({
        address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
        abi: vestingAbi,
        functionName: 'claim',
        args: [id],
      });
    } catch (error) {
      console.error('Claim failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 relative z-0">
      <h1 className="text-2xl font-bold mb-4">My Vestings</h1>
      {schedules.length === 0 ? (
        <p className="text-gray-600">No vesting schedules found.</p>
      ) : (
        <div className="space-y-3">
          {schedules.map(({ id, s }) => {
            const dec = decimalsMap[s.token.toLowerCase()] ?? 18;
            const total = formatUnits((s.totalAmount ?? (0 as unknown as bigint)), dec);
            const released = formatUnits((s.released ?? (0 as unknown as bigint)), dec);
            return (
              <div key={id.toString()} className="border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-600">#{id.toString()}</div>
                  <div className="font-medium">Token: {s.token}</div>
                  <div className="text-sm">Total: {total}</div>
                  <div className="text-sm">Released: {released}</div>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={() => claim(id)}
                  disabled={isLoading}
                >
                  {isLoading ? 'Claiming...' : 'Claim'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



