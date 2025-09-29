'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import tokenFactoryAbi from '@/lib/abis/tokenFactory.json';

const createTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required'),
  symbol: z.string().min(2, 'Symbol must be at least 2 characters').max(6, 'Symbol must be at most 6 characters'),
  totalSupply: z.string().min(1, 'Total supply is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Total supply must be a positive number'),
  owner: z.string().min(42, 'Invalid address').max(42, 'Invalid address'),
});

type CreateTokenForm = z.infer<typeof createTokenSchema>;

export default function CreateTokenPage() {
  const { address } = useAccount();
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<CreateTokenForm>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: {
      owner: address || '',
    },
  });

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

  const onSubmit = async (data: CreateTokenForm) => {
    if (!process.env.NEXT_PUBLIC_TOKEN_FACTORY) {
      addToast({
        type: 'error',
        title: 'Configuration Error',
        description: 'Token factory contract address not configured',
      });
      return;
    }

    setIsLoading(true);
    try {
      writeContract({
        address: process.env.NEXT_PUBLIC_TOKEN_FACTORY as `0x${string}`,
        abi: tokenFactoryAbi,
        functionName: 'create',
        args: [data.name, data.symbol, BigInt(data.totalSupply), data.owner as `0x${string}`],
      });
    } catch (error) {
      console.error('Error creating token:', error);
      addToast({
        type: 'error',
        title: 'Transaction Failed',
        description: 'Failed to create token. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update owner field when wallet connects
  if (address) {
    setValue('owner', address);
  }

  if (isSuccess && hash) {
    addToast({
      type: 'success',
      title: 'Token Created Successfully!',
      description: 'Your token has been deployed to the blockchain.',
    });
  }

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Token</h1>
              <p className="text-gray-600">
                Deploy a new ERC-20 token on Plasma Mainnet Beta with custom parameters.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                label="Token Name"
                placeholder="My Awesome Token"
                error={errors.name?.message}
                {...register('name')}
                required
              />

              <FormField
                label="Token Symbol"
                placeholder="MAT"
                error={errors.symbol?.message}
                helperText="2-6 characters, will be displayed as MAT"
                {...register('symbol')}
                required
              />

              <FormField
                label="Total Supply"
                placeholder="1000000"
                error={errors.totalSupply?.message}
                helperText="Total number of tokens to be minted"
                {...register('totalSupply')}
                required
              />

              <FormField
                label="Owner Address"
                placeholder="0x..."
                error={errors.owner?.message}
                helperText="Address that will own the token contract"
                {...register('owner')}
                required
              />

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={isLoading || isPending || isConfirming}
                  className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading || isPending || isConfirming ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                      {isLoading ? 'Preparing...' : isPending ? 'Confirming...' : 'Processing...'}
                    </div>
                  ) : (
                    'Create Token'
                  )}
                </button>
              </div>
            </form>

            {isSuccess && hash && (
              <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800 mb-2">Token Created Successfully!</h3>
                <p className="text-green-700 mb-4">
                  Your token has been deployed to the blockchain.
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
