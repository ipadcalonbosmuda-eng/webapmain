'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { explorerUrl } from '@/lib/utils';
import { formatUnits } from 'viem';

type LockRow = {
  lockId: bigint;
  token: `0x${string}`;
  amount: bigint;
  withdrawn: bigint;
  lockUntil: bigint;
  withdrawable: bigint;
  decimals: number;
  symbol: string;
};

export default function MyLockPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<LockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<bigint | null>(null);
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const locker = process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}` | undefined;

  const safeFormat = (value?: bigint, decimals?: number, symbol?: string) => {
    try {
      const v = typeof value === 'bigint' ? value : BigInt(0);
      const d = typeof decimals === 'number' && Number.isFinite(decimals) ? decimals : 18;
      const s = symbol || '';
      return `${formatUnits(v, d)} ${s}`.trim();
    } catch {
      try {
        return `${String(value ?? BigInt(0))} ${symbol || ''}`.trim();
      } catch {
        return '0';
      }
    }
  };

  const fetchData = async () => {
    if (!publicClient || !locker || !address) {
      setRows([]);
      return;
    }
    setIsLoading(true);
    try {
      const lockIds = await publicClient.readContract({
        address: locker,
        abi: [
          { inputs: [{ name: 'owner', type: 'address' }], name: 'locksOf', outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
        ],
        functionName: 'locksOf',
        args: [address],
      }) as bigint[];

      const results: LockRow[] = [];
      for (const id of lockIds) {
        const [info, wdr] = await Promise.all([
          publicClient.readContract({
            address: locker,
            abi: [
              {
                inputs: [{ name: '', type: 'uint256' }],
                name: 'locks',
                outputs: [
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                  { name: 'withdrawn', type: 'uint256' },
                  { name: 'lockUntil', type: 'uint256' },
                  { name: 'owner', type: 'address' },
                ],
                stateMutability: 'view',
                type: 'function',
              },
            ],
            functionName: 'locks',
            args: [id],
          }) as unknown as { token: `0x${string}`; amount: bigint; withdrawn: bigint; lockUntil: bigint; owner: `0x${string}` },
          publicClient.readContract({
            address: locker,
            abi: [
              { inputs: [{ name: 'lockId', type: 'uint256' }], name: 'withdrawable', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
            ],
            functionName: 'withdrawable',
            args: [id],
          }) as Promise<bigint>,
        ]);

        // Fetch ERC20 decimals and symbol for display
        let decimals = 18;
        let symbol = '';
        try {
          const [dec, sym] = await Promise.all([
            publicClient.readContract({
              address: info.token,
              abi: [
                { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
              ],
              functionName: 'decimals',
              args: [],
            }) as Promise<number>,
            publicClient.readContract({
              address: info.token,
              abi: [
                { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
              ],
              functionName: 'symbol',
              args: [],
            }) as Promise<string>,
          ]);
          decimals = Number(dec ?? 18);
          symbol = sym ?? '';
        } catch {
          // ignore
        }

        results.push({
          lockId: id,
          token: info.token,
          amount: info.amount,
          withdrawn: info.withdrawn,
          lockUntil: info.lockUntil,
          withdrawable: wdr,
          decimals,
          symbol,
        });
      }

      setRows(results);
    } catch (err) {
      console.error('Failed to load locks:', err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient, locker]);

  const onWithdraw = async (lockId: bigint) => {
    if (!locker) return;
    setSelected(lockId);
    await writeContract({
      address: locker,
      abi: [
        { inputs: [{ name: 'lockId', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
      ],
      functionName: 'withdraw',
      args: [lockId],
    });
  };

  useEffect(() => {
    if (isSuccess) {
      fetchData();
      setSelected(null);
    }
  }, [isSuccess]);

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Lock</h1>
            <p className="text-gray-600">Manage and withdraw your unlocked tokens.</p>
          </div>

          <div className="card p-6 overflow-x-auto">
            {isLoading ? (
              <p className="text-gray-600">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-gray-600">No locks found for your address.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4">Lock ID</th>
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Withdrawn</th>
                    <th className="py-2 pr-4">Unlock Time</th>
                    <th className="py-2 pr-4">Withdrawable</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row?.lockId ? String(row.lockId) : `row-${idx}`} className="border-t border-gray-200">
                      <td className="py-3 pr-4 font-mono">{row?.lockId ? String(row.lockId) : '-'}</td>
                      <td className="py-3 pr-4 font-mono break-all">{row?.token || '-'}</td>
                      <td className="py-3 pr-4">
                        {row ? safeFormat((row.amount ?? BigInt(0)) - (row.withdrawn ?? BigInt(0)), row.decimals, row.symbol) : '-'}
                      </td>
                      <td className="py-3 pr-4">
                        {row ? safeFormat(row.withdrawn, row.decimals, row.symbol) : '-'}
                      </td>
                      <td className="py-3 pr-4">{new Date(Number(row?.lockUntil ?? BigInt(0)) * 1000).toLocaleString()}</td>
                      <td className="py-3 pr-4">{row ? safeFormat(row.withdrawable, row.decimals, row.symbol) : '-'}</td>
                      <td className="py-3 pr-4">
                        <button
                          className="btn-primary px-3 py-1"
                          disabled={!row || row.withdrawable === BigInt(0) || isPending || isConfirming}
                          onClick={() => onWithdraw(row.lockId)}
                        >
                          {selected === row.lockId && (isPending || isConfirming) ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {txHash && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <a href={explorerUrl('', txHash)} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">View transaction on explorer</a>
            </div>
          )}
        </div>
      </div>
    </RequireWallet>
  );
}


