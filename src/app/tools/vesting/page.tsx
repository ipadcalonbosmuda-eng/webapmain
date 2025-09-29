'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import vestingFactoryAbi from '@/lib/abis/vestingFactory.json';

const vestingSchema = z.object({
  beneficiary: z.string().min(42, 'Invalid beneficiary address').max(42, 'Invalid beneficiary address'),
  totalAmount: z.string().min(1, 'Total amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Total amount must be a positive number'),
  cliffMonths: z.string().min(0, 'Cliff months must be 0 or greater').refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Cliff months must be a valid number'),
  durationMonths: z.string().min(1, 'Duration months is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Duration months must be a positive number'),
  releaseMode: z.enum(['0', '1']),
});

type VestingForm = z.infer<typeof vestingSchema>;

export default function VestingPage() {
  const { address } = useAccount();
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createdScheduleId, setCreatedScheduleId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VestingForm>({
    defaultValues: {
      beneficiary: address || '',
      releaseMode: '0',
    },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });


  // Read claimable amount
  const { data: claimable } = useReadContract({
    address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
    abi: vestingFactoryAbi,
    functionName: 'claimableAmount',
    args: createdScheduleId ? [BigInt(createdScheduleId)] : undefined,
    query: {
      enabled: !!createdScheduleId && !!process.env.NEXT_PUBLIC_VESTING_FACTORY,
    },
  });

  const addToast = (toast: ToastData) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const onSubmit = async (data: VestingForm) => {
    if (!process.env.NEXT_PUBLIC_VESTING_FACTORY) {
      addToast({
        type: 'error',
        title: 'Configuration Error',
        description: 'Vesting factory contract address not configured',
      });
      return;
    }

    setIsLoading(true);
    try {
      writeContract({
        address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
        abi: vestingFactoryAbi,
        functionName: 'createSchedule',
        args: [
          data.beneficiary as `0x${string}`,
          BigInt(data.totalAmount),
          BigInt(data.cliffMonths),
          BigInt(data.durationMonths),
          Number(data.releaseMode),
        ],
      });
    } catch (error) {
      console.error('Error creating vesting schedule:', error);
      addToast({
        type: 'error',
        title: 'Transaction Failed',
        description: 'Failed to create vesting schedule. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!createdScheduleId || !process.env.NEXT_PUBLIC_VESTING_FACTORY) return;

    try {
      writeContract({
        address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
        abi: vestingFactoryAbi,
        functionName: 'claim',
        args: [BigInt(createdScheduleId)],
      });
    } catch (error) {
      console.error('Error claiming tokens:', error);
      addToast({
        type: 'error',
        title: 'Claim Failed',
        description: 'Failed to claim tokens. Please try again.',
      });
    }
  };

  if (isSuccess && hash) {
    addToast({
      type: 'success',
      title: 'Vesting Schedule Created!',
      description: 'Your vesting schedule has been created successfully.',
    });
    // In a real app, you'd parse the transaction receipt to get the schedule ID
    setCreatedScheduleId('1'); // Placeholder
  }

  // Update beneficiary field when wallet connects
  if (address) {
    // This would need to be handled differently in a real implementation
  }

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Token Vesting</h1>
            <p className="text-gray-600">
              Create and manage token vesting schedules with custom cliff and duration periods.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-8">
              <div className="card p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <FormField
                      label="Beneficiary Address"
                      placeholder="0x..."
                      error={errors.beneficiary?.message}
                      helperText="Address that will receive the vested tokens"
                      {...register('beneficiary')}
                      required
                    />
                  </div>

                  <FormField
                    label="Total Amount"
                    placeholder="1000000"
                    error={errors.totalAmount?.message}
                    helperText="Total amount of tokens to be vested"
                    {...register('totalAmount')}
                    required
                  />

                  <FormField
                    label="Cliff Months"
                    placeholder="6"
                    error={errors.cliffMonths?.message}
                    helperText="Number of months before vesting starts (0 for immediate vesting)"
                    {...register('cliffMonths')}
                    required
                  />

                  <FormField
                    label="Duration Months"
                    placeholder="12"
                    error={errors.durationMonths?.message}
                    helperText="Total duration of the vesting schedule in months"
                    {...register('durationMonths')}
                    required
                  />

                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Release Mode <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="0"
                          {...register('releaseMode')}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Linear (continuous release)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="1"
                          {...register('releaseMode')}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Step (monthly releases)</span>
                      </label>
                    </div>
                    {errors.releaseMode && (
                      <p className="text-sm text-red-600">{errors.releaseMode.message}</p>
                    )}
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
                        'Create Vesting Schedule'
                      )}
                    </button>
                  </div>
                </form>

                {createdScheduleId && (
                  <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Vesting Schedule Created!</h3>
                    <p className="text-blue-700 mb-4">
                      Schedule ID: {createdScheduleId}
                    </p>
                    {claimable && typeof claimable === 'bigint' && claimable > BigInt(0) ? (
                      <div className="mb-4">
                        <p className="text-blue-700 mb-2">
                          Claimable Amount: {claimable.toString()}
                        </p>
                        <button
                          onClick={handleClaim}
                          className="btn-primary"
                        >
                          Claim Tokens
                        </button>
                      </div>
                    ) : null}
                    <a
                      href={explorerUrl('', hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
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

            {/* Right: Helper Panel */}
            <div className="lg:col-span-4">
              <div className="card p-6 lg:sticky lg:top-24 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Guidelines</h3>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>`Cliff` is the delay before vesting starts.</li>
                  <li>`Duration` is the total length of the vesting schedule.</li>
                  <li>Choose the release mode that fits your distribution.</li>
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
