'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import tokenFactoryAbi from '@/lib/abis/tokenFactory.json';
import { parseUnits } from 'viem';

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
    watch,
  } = useForm<CreateTokenForm>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: {
      owner: address || '',
    },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash,
  });

  // Add contract diagnostic info (run once on mount)
  const contractAddress = process.env.NEXT_PUBLIC_TOKEN_FACTORY;
  
  useEffect(() => {
    console.log('🔍 Contract Diagnostic:', {
      address: contractAddress,
      addressValid: contractAddress?.startsWith('0x') && contractAddress.length === 42,
      timestamp: new Date().toISOString()
    });
  }, []); // Empty dependency array = run once on mount

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
      console.log('🚀 Creating Token:', { name: data.name, symbol: data.symbol });

      // Convert total supply to wei using viem's parseUnits (no BigInt literals)
      const totalSupplyWithDecimals = parseUnits(data.totalSupply, 18);

      // Validate contract address format
      const contractAddress = process.env.NEXT_PUBLIC_TOKEN_FACTORY;
      if (!contractAddress || !contractAddress.startsWith('0x') || contractAddress.length !== 42) {
        addToast({
          type: 'error',
          title: 'Invalid Contract Address',
          description: `Token factory contract address is invalid: ${contractAddress}`,
        });
        return;
      }

      // Single canonical call matching our TokenFactory
      await writeContract({
        address: contractAddress as `0x${string}`,
        abi: tokenFactoryAbi,
        functionName: 'createToken',
        args: [data.name, data.symbol, totalSupplyWithDecimals, data.owner as `0x${string}`],
      });

      {
        addToast({
          type: 'success',
          title: 'Token Creation Submitted',
          description: 'Transaction has been submitted to the blockchain.',
        });
      }
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
  useEffect(() => {
    if (address) {
      setValue('owner', address);
    }
  }, [address, setValue]);

  useEffect(() => {
    if (isSuccess && hash) {
      addToast({
        type: 'success',
        title: 'Token Created Successfully!',
        description: 'Your token has been deployed to the blockchain.',
      });
    }
  }, [isSuccess, hash, addToast]);


  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Token</h1>
            <p className="text-gray-600">
              Deploy a new ERC-20 token on Plasma Mainnet Beta with custom parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-8">
              <div className="card p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <FormField
                      label="Token Name"
                      placeholder="My Awesome Token"
                      error={errors.name?.message}
                      {...register('name')}
                      required
                    />
                  </div>

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

                  <div className="md:col-span-2">
                    <FormField
                      label="Owner Address"
                      placeholder="0x..."
                      error={errors.owner?.message}
                      helperText="Address that will own the token contract"
                      {...register('owner')}
                      required
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

            {/* Right: Preview/Guide */}
            <div className="lg:col-span-4">
              <div className="card p-6 lg:sticky lg:top-24 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-semibold text-gray-900">{watch('name') || '—'}</p>
                    <p className="text-sm text-gray-600 mt-3">Symbol</p>
                    <p className="font-semibold text-gray-900">{watch('symbol') || '—'}</p>
                    <p className="text-sm text-gray-600 mt-3">Total Supply</p>
                    <p className="font-semibold text-gray-900">{watch('totalSupply') || '—'}</p>
                    <p className="text-sm text-gray-600 mt-3">Owner</p>
                    <p className="font-mono text-gray-900 break-all">{watch('owner') || '—'}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Guidelines</h3>
                  <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                    <li>Symbol should be 2–6 characters; uppercase is recommended.</li>
                    <li>Total Supply is the initial number of tokens to mint.</li>
                    <li>Owner Address will become the token contract owner.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </RequireWallet>
  );
}
