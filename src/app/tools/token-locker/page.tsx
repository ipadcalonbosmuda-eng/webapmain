'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import tokenLockerAbi from '@/lib/abis/tokenLocker.json';

const tokenLockerSchema = z.object({
  tokenAddress: z.string().min(42, 'Invalid token address').max(42, 'Invalid token address'),
  amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  lockUntil: z.string().min(1, 'Lock date is required'),
  cliff: z.string().optional(),
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
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const tokenAddress = watch('tokenAddress');
  const amount = watch('amount');

  // Check allowance
  const { data: allowance } = useReadContract({
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

  const addToast = (toast: ToastData) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleApprove = async () => {
    if (!tokenAddress || !amount || !process.env.NEXT_PUBLIC_TOKEN_LOCKER) return;

    try {
      writeContract({
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
        args: [process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}`, BigInt(amount)],
      });
    } catch (error) {
      console.error('Error approving token:', error);
      addToast({
        type: 'error',
        title: 'Approval Failed',
        description: 'Failed to approve token spending. Please try again.',
      });
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
      const cliff = data.cliff ? Math.floor(new Date(data.cliff).getTime() / 1000) : 0;

      writeContract({
        address: process.env.NEXT_PUBLIC_TOKEN_LOCKER as `0x${string}`,
        abi: tokenLockerAbi,
        functionName: 'lock',
        args: [
          data.tokenAddress as `0x${string}`,
          BigInt(data.amount),
          BigInt(lockUntil),
          BigInt(cliff),
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

  // Check if approval is needed
  const needsApprovalCheck = !!(allowance && amount && BigInt(allowance) < BigInt(amount));

  if (isSuccess && hash) {
    addToast({
      type: 'success',
      title: 'Token Locked Successfully!',
      description: 'Your token has been locked with the specified parameters.',
    });
  }

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Token Locker</h1>
              <p className="text-gray-600">
                Lock your ERC-20 tokens with custom vesting schedules and cliff periods.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                label="Token Address"
                placeholder="0x..."
                error={errors.tokenAddress?.message}
                helperText="ERC-20 token contract address to lock"
                {...register('tokenAddress')}
                required
              />

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

              <FormField
                label="Cliff Date (Optional)"
                type="datetime-local"
                error={errors.cliff?.message}
                helperText="Date when tokens start vesting (optional)"
                {...register('cliff')}
              />

              {needsApprovalCheck && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 mb-3">
                    You need to approve the token locker to spend your tokens first.
                  </p>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isPending || isConfirming}
                    className="btn-primary"
                  >
                    Approve Token Spending
                  </button>
                </div>
              )}

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={isLoading || isPending || isConfirming || needsApprovalCheck}
                  className="btn-primary w-full py-3 text-lg"
                >
                  {isLoading || isPending || isConfirming ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                      {isLoading ? 'Preparing...' : isPending ? 'Confirming...' : 'Processing...'}
                    </div>
                  ) : (
                    'Lock Token'
                  )}
                </button>
              </div>
            </form>

            {isSuccess && hash && (
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
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </RequireWallet>
  );
}
