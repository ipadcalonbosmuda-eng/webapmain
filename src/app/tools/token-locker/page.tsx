'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseUnits } from 'viem';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import tokenLockerAbi from '@/lib/abis/tokenLocker.json';

const tokenLockerSchema = z.object({
  tokenAddress: z.string().min(42, 'Invalid token address').max(42, 'Invalid token address'),
  amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  lockUntil: z.string().min(1, 'Lock date is required'),
});

type TokenLockerForm = z.infer<typeof tokenLockerSchema>;

export default function TokenLockerPage() {
  const { address } = useAccount();
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<TokenLockerForm>();

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, status: receiptStatus } = useWaitForTransactionReceipt({
    hash,
  });
  const publicClient = usePublicClient();
  const [isApproving, setIsApproving] = useState(false);
  const [approvedForAmount, setApprovedForAmount] = useState(false);
  const [lastTxType, setLastTxType] = useState<'approve' | 'lock' | null>(null);

  const tokenAddress = watch('tokenAddress');
  const amount = watch('amount');

  // Read token decimals (default to 18 if call fails) for correct unit conversion
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: [
      {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'decimals',
    query: { enabled: !!tokenAddress },
  });
  const decimals = Number((tokenDecimals as unknown as number) ?? 18);

  // Reset local approval flag when token/amount changes
  useEffect(() => {
    // Reset approval state when user changes token or amount
    setApprovedForAmount(false);
  }, [tokenAddress, amount]);

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: [
      {
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'allowance',
    args: address && tokenAddress ? [address, process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!tokenAddress && !!process.env.NEXT_PUBLIC_TOKEN_LOCKER,
    },
  });

  // When on-chain allowance becomes sufficient, mark approved to avoid double-approve
  useEffect(() => {
    const required = amount ? parseUnits(amount, decimals) : BigInt(0);
    if (typeof allowance === 'bigint' && allowance >= required) {
      setApprovedForAmount(true);
    }
  }, [allowance, amount, decimals]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast: ToastData) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  }, [removeToast]);

  // Approve only, then user can lock as separate step
  const handleApprove = async () => {
    if (!tokenAddress || !amount || !process.env.NEXT_PUBLIC_TOKEN_LOCKER) return;
    try {
      setIsApproving(true);
      setLastTxType('approve');
      const amountInUnits = parseUnits(amount, decimals);
      const approveHash = await writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'approve',
        args: [process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}`, amountInUnits],
      });
      if (publicClient && approveHash) {
        await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });
      }

      // Try to refetch allowance and determine state. If refetch missing or fails, fallback to optimistic true.
      try {
        const res = await refetchAllowance?.();
        const latestAllowance = (res?.data ?? allowance) as unknown as bigint | undefined;
        if (typeof latestAllowance === 'bigint') {
          setApprovedForAmount(latestAllowance >= amountInUnits);
        } else {
          setApprovedForAmount(true);
        }
      } catch {
        setApprovedForAmount(true);
      }
      addToast({
        type: 'success',
        title: 'Approved Successfully',
        description: 'Locker is now approved to spend your tokens.',
      });
    } catch (error) {
      console.error('Error approving token:', error);
      setApprovedForAmount(false);
      addToast({
        type: 'error',
        title: 'Approval Failed',
        description: 'Failed to approve token spending. Please try again.',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const onSubmit = async (data: TokenLockerForm) => {
    if (!process.env.NEXT_PUBLIC_TOKEN_LOCKER) {
      addToast({
        type: 'error',
        title: 'Configuration Error',
        description: 'Token locker contract address not configured',
      });
      return;
    }

    setIsLoading(true);
    try {
      const lockUntil = Math.floor(new Date(data.lockUntil).getTime() / 1000);
      const amountInUnits = parseUnits(data.amount, decimals);
      setLastTxType('lock');

      // Perform the lock (this sets hash for the success UI)
      await writeContract({
        address: process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}`,
        abi: tokenLockerAbi,
        functionName: 'lock',
        args: [
          data.tokenAddress as `0x${string}`,
          amountInUnits,
          BigInt(lockUntil),
        ],
      });
    } catch (error) {
      console.error('Error locking token:', error);
      addToast({
        type: 'error',
        title: 'Transaction Failed',
        description: 'Failed to lock token. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Compute whether we still need approval (uses on-chain allowance; local flag prevents flicker post-approval)
  const amountInUnitsForCheck = amount ? parseUnits(amount, decimals) : BigInt(0);
  const onChainNeedsApproval = typeof allowance !== 'bigint' || allowance < amountInUnitsForCheck;
  const needsApprovalCheck = !!(amount && tokenAddress && (onChainNeedsApproval && !approvedForAmount));

  // One-time success toast per transaction
  const lastNotifiedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (isSuccess && receiptStatus === 'success' && hash && lastTxType === 'lock' && lastNotifiedHashRef.current !== hash) {
      addToast({
        type: 'success',
        title: 'Token Locked Successfully!',
        description: 'Your token has been locked until the specified date.',
      });
      lastNotifiedHashRef.current = hash;
    }
  }, [isSuccess, receiptStatus, hash, lastTxType, addToast]);

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Token Locker</h1>
            <p className="text-gray-600">Lock your ERC-20 tokens until a specified unlock date.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-8">
              <div className="card p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <FormField
                      label="Token Address"
                      placeholder="0x..."
                      error={errors.tokenAddress?.message}
                      helperText="ERC-20 token contract address to lock"
                      {...register('tokenAddress')}
                      required
                    />
                  </div>

                  <FormField
                    label="Amount to Lock"
                    placeholder="1000"
                    error={errors.amount?.message}
                    helperText="Amount of tokens to lock (in token units)"
                    {...register('amount')}
                    required
                  />

                  <FormField
                    label="Lock Until"
                    type="datetime-local"
                    error={errors.lockUntil?.message}
                    helperText="Date and time when tokens will be unlocked"
                    {...register('lockUntil')}
                    required
                  />

                  {/* Cliff removed: simple timelock */}

                  {/* Single button flow: first Approve, then Lock */}

                  <div className="md:col-span-2 pt-2">
                    <button
                      type={needsApprovalCheck ? 'button' : 'submit'}
                      onClick={needsApprovalCheck ? handleApprove : undefined}
                      disabled={needsApprovalCheck ? (isApproving || isPending || isConfirming) : (isLoading || isPending || isConfirming)}
                      className="btn-primary w-full py-3 text-lg"
                    >
                      {needsApprovalCheck ? (
                        isApproving || isPending || isConfirming ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                            {isApproving ? 'Approving...' : isPending ? 'Confirming...' : 'Processing...'}
                          </div>
                        ) : (
                          'Approve Token Spending'
                        )
                      ) : (
                        isLoading || isPending || isConfirming ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                            {isLoading ? 'Preparing...' : isPending ? 'Confirming...' : 'Processing...'}
                          </div>
                        ) : (
                          'Lock Token'
                        )
                      )}
                    </button>
                  </div>
                </form>

                {isSuccess && hash && lastTxType === 'lock' && (
                  <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Token Locked Successfully!</h3>
                    <p className="text-green-700 mb-4">
                      Your token has been locked with the specified parameters.
                    </p>
                    <a
                      href={explorerUrl('', hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-green-600 hover:text-green-800 font-medium"
                    >
                      View Transaction on Explorer
                      <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Info Panel */}
            <div className="lg:col-span-4">
              <div className="card p-6 lg:sticky lg:top-24 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Tips</h3>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>Ensure your token supports `approve` for the locker.</li>
                  <li>Use a future date for `Lock Until`.</li>
                  {/* Cliff removed for Token Locker */}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </RequireWallet>
  );
}
