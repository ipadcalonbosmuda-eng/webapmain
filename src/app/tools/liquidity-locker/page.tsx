'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import liquidityLockerAbi from '@/lib/abis/liquidityLocker.json';

const liquidityLockerSchema = z.object({
  lpTokenAddress: z.string().min(42, 'Invalid LP token address').max(42, 'Invalid LP token address'),
  amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  unlockDate: z.string().min(1, 'Unlock date is required'),
  memo: z.string().optional(),
});

type LiquidityLockerForm = z.infer<typeof liquidityLockerSchema>;

export default function LiquidityLockerPage() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isComingSoon = true; // Toggle: blur UI while feature is not ready

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LiquidityLockerForm>();

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const addToast = (toast: ToastData) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const onSubmit = async (data: LiquidityLockerForm) => {
    if (!process.env.NEXT_PUBLIC_LP_LOCKER) {
      addToast({
        type: 'error',
        title: 'Configuration Error',
        description: 'Liquidity locker contract address not configured',
      });
      return;
    }

    setIsLoading(true);
    try {
      const unlockDate = Math.floor(new Date(data.unlockDate).getTime() / 1000);

      writeContract({
        address: process.env.NEXT_PUBLIC_LP_LOCKER as `0x${string}`,
        abi: liquidityLockerAbi,
        functionName: 'lock',
        args: [
          data.lpTokenAddress as `0x${string}`,
          BigInt(data.amount),
          BigInt(unlockDate),
          data.memo || '',
        ],
      });
    } catch (error) {
      console.error('Error locking LP token:', error);
      addToast({
        type: 'error',
        title: 'Transaction Failed',
        description: 'Failed to lock LP token. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess && hash) {
    addToast({
      type: 'success',
      title: 'LP Token Locked Successfully!',
      description: 'Your liquidity token has been locked with the specified parameters.',
    });
  }

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Liquidity Locker</h1>
            <p className="text-gray-600">
              Lock your LP tokens to demonstrate long-term commitment to liquidity provision.
            </p>
          </div>

          {/* Blur overlay while coming soon */}
          {isComingSoon && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              <div className="absolute inset-0 backdrop-blur-sm bg-white/60" />
              <div className="absolute inset-x-0 top-24 mx-auto max-w-2xl z-20 text-center px-6">
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 p-4 shadow-sm">
                  <p className="font-semibold mb-1">Coming Soon</p>
                  <p className="text-sm">
                    Liquidity Locker is not available yet. For now, you can lock your LP tokens using the Token Locker.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 ${isComingSoon ? 'blur-sm select-none' : ''}`}>
            {/* Left: Form */}
            <div className="lg:col-span-8">
              <div className="card p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <FormField
                      label="LP Token Address"
                      placeholder="0x..."
                      error={errors.lpTokenAddress?.message}
                      helperText="Liquidity pool token contract address to lock"
                      {...register('lpTokenAddress')}
                      required
                    />
                  </div>

                  <FormField
                    label="Amount to Lock"
                    placeholder="1000"
                    error={errors.amount?.message}
                    helperText="Amount of LP tokens to lock (in token units)"
                    {...register('amount')}
                    required
                  />

                  <FormField
                    label="Unlock Date"
                    type="datetime-local"
                    error={errors.unlockDate?.message}
                    helperText="Date and time when LP tokens will be unlocked"
                    {...register('unlockDate')}
                    required
                  />

                  <div className="md:col-span-2">
                    <FormField
                      label="Memo (Optional)"
                      placeholder="Locked for 1 year"
                      error={errors.memo?.message}
                      helperText="Optional note about this lock"
                      {...register('memo')}
                    />
                  </div>

                  <div className="md:col-span-2 pt-2">
                    <button
                      type="submit"
                      disabled={isLoading || isPending || isConfirming}
                      className="btn-primary w-full py-3 text-lg"
                    >
                      {isLoading || isPending || isConfirming ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                          {isLoading ? 'Preparing...' : isPending ? 'Confirming...' : 'Processing...'}
                        </div>
                      ) : (
                        'Lock LP Token'
                      )}
                    </button>
                  </div>
                </form>

                {isSuccess && hash && (
                  <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">LP Token Locked Successfully!</h3>
                    <p className="text-green-700 mb-4">
                      Your liquidity token has been locked with the specified parameters.
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
                <h3 className="text-lg font-semibold text-gray-900">Checklist</h3>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>Use the correct LP token contract address.</li>
                  <li>Ensure the amount is in token units.</li>
                  <li>Memo is optional.</li>
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
