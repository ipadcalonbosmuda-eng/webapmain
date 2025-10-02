'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl } from '@/lib/utils';
import vestingFactoryAbi from '@/lib/abis/vestingFactory.json';
import { Trash2 } from 'lucide-react';

const vestingSchema = z.object({
  tokenAddress: z.string().min(42, 'Invalid token address').max(42, 'Invalid token address'),
  recipients: z.array(z.object({
    beneficiary: z.string().min(42, 'Invalid beneficiary address').max(42, 'Invalid beneficiary address'),
    amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  })).min(1, 'At least one recipient').max(20, 'Maximum 20 recipients'),
  cliffMonths: z.string().min(0, 'Cliff months must be 0 or greater').refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Cliff months must be a valid number'),
  durationMonths: z.string().min(1, 'Duration months is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Duration months must be a positive number'),
  releaseMode: z.enum(['0', '1']),
  advancedEnabled: z.boolean().optional(),
  firstMonthPercent: z.string().optional(),
  subsequentMonthPercent: z.string().optional(),
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
    watch,
    control,
  } = useForm<VestingForm>({
    resolver: zodResolver(vestingSchema),
    defaultValues: {
      tokenAddress: '',
      recipients: [{ beneficiary: address || '', amount: '' }],
      releaseMode: '0',
      advancedEnabled: false,
      firstMonthPercent: '',
      subsequentMonthPercent: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'recipients' });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });


  // Read claimable amount (new ABI: getClaimableAmount)
  const { data: claimable } = useReadContract({
    address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
    abi: vestingFactoryAbi,
    functionName: 'getClaimableAmount',
    args: createdScheduleId ? [BigInt(createdScheduleId)] : undefined,
    query: {
      enabled: !!createdScheduleId && !!process.env.NEXT_PUBLIC_VESTING_FACTORY,
    },
  });

  // Detect selected token from form and show available wallet balance
  const tokenAddress = watch('tokenAddress') as string | undefined;
  const vestedTokenAddress = tokenAddress && tokenAddress.length === 42 ? (tokenAddress as `0x${string}`) : undefined;

  const { data: tokenDecimals } = useReadContract({
    address: vestedTokenAddress,
    abi: [
      { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
    ],
    functionName: 'decimals',
    query: { enabled: !!vestedTokenAddress },
  });
  const decimals = Number((tokenDecimals as unknown as number) ?? 18);

  const { data: tokenSymbolData } = useReadContract({
    address: vestedTokenAddress,
    abi: [
      { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
    ],
    functionName: 'symbol',
    query: { enabled: !!vestedTokenAddress },
  });
  const tokenSymbol = (tokenSymbolData as unknown as string) ?? '';

  const { data: walletBalanceData } = useReadContract({
    address: vestedTokenAddress,
    abi: [
      { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    ],
    functionName: 'balanceOf',
    args: address && vestedTokenAddress ? [address] : undefined,
    query: { enabled: !!address && !!vestedTokenAddress },
  });
  const walletBalance = (walletBalanceData as unknown as bigint) ?? BigInt(0);
  const walletBalanceFormatted = (() => {
    try {
      return formatUnits(walletBalance, decimals);
    } catch {
      return walletBalance.toString();
    }
  })();

  // Amount helpers and derived summary values
  const parseUnitsSafe = (val?: string, dec?: number): bigint | null => {
    try {
      if (!val) return null;
      if (!/^\d+(?:\.\d+)?$/.test(val)) return null;
      return parseUnits(val, typeof dec === 'number' ? dec : 18);
    } catch {
      return null;
    }
  };

  const recipientsWatch = watch('recipients') || [];
  const totalAmountParsed = (() => {
    try {
      return recipientsWatch.reduce((sum: bigint, r: { amount?: string }) => {
        const v = parseUnitsSafe(r?.amount, decimals);
        return sum + (v ?? BigInt(0));
      }, BigInt(0));
    } catch {
      return null;
    }
  })();

  const cliffMonthsNum = Number(watch('cliffMonths') || 0) || 0;
  const durationMonthsNum = Number(watch('durationMonths') || 0) || 0;
  const vestingMonths = Math.max(0, durationMonthsNum - cliffMonthsNum);
  const monthlyAmount = vestingMonths > 0 && totalAmountParsed ? (totalAmountParsed / BigInt(vestingMonths)) : null;
  const monthlyAmountFormatted = monthlyAmount !== null ? (() => { try { return formatUnits(monthlyAmount, decimals); } catch { return monthlyAmount.toString(); } })() : '-';
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + durationMonthsNum * 30 * 24 * 60 * 60 * 1000);
  const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

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
      // For ABI compatibility shown earlier, we create one schedule per recipient sequentially
      const targets = (data.recipients || []).filter((r) => parseUnitsSafe(r?.amount, decimals) !== null);
      if (targets.length === 0) {
        addToast({ type: 'error', title: 'Invalid recipients', description: 'Please add at least one valid recipient and amount.' });
        return;
      }
      for (const r of targets) {
        const amountEach = parseUnitsSafe(r?.amount, decimals);
        if (amountEach === null) continue;
        const custom: Array<{ timestamp: bigint; amount: bigint; claimed: boolean }> = [];
        if (watch('advancedEnabled')) {
          const firstPct = Number(watch('firstMonthPercent') || '0');
          const nextPct = Number(watch('subsequentMonthPercent') || '0');
          if (firstPct >= 0 && nextPct >= 0) {
            const totalMonths = Number(data.durationMonths);
            const firstAmt = (amountEach * BigInt(Math.round(firstPct * 100))) / BigInt(10000);
            const remaining = amountEach - firstAmt;
            const monthsAfterFirst = Math.max(0, totalMonths - 1);
            const monthlyAmt = monthsAfterFirst > 0 ? (remaining * BigInt(Math.round(nextPct * 100))) / BigInt(10000) : BigInt(0);
            let sum = firstAmt;
            // Build releases: first month
            if (firstAmt > BigInt(0)) {
              custom.push({ timestamp: BigInt(Math.floor(Date.now() / 1000) + SECONDS_PER_MONTH), amount: firstAmt, claimed: false });
            }
            // Subsequent months
            for (let i = 2; i <= totalMonths; i++) {
              if (monthlyAmt === BigInt(0)) break;
              let amt = monthlyAmt;
              if (i === totalMonths) {
                // Final correction to reach total
                amt = amountEach - sum;
              }
              if (amt > BigInt(0)) {
                custom.push({ timestamp: BigInt(Math.floor(Date.now() / 1000) + SECONDS_PER_MONTH * i), amount: amt, claimed: false });
                sum += amt;
              }
            }
          }
        }
        await writeContract({
          address: process.env.NEXT_PUBLIC_VESTING_FACTORY as `0x${string}`,
          abi: vestingFactoryAbi,
          functionName: 'createSchedule',
          args: [
            data.tokenAddress as `0x${string}`,
            r.beneficiary as `0x${string}`,
            amountEach,
            BigInt(data.cliffMonths),
            BigInt(data.durationMonths),
            Number(data.releaseMode),
            custom as unknown as [],
          ],
        });
      }
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
                  {/* Token Address */}
                  <div className="md:col-span-2">
                    <FormField
                      label="Token Address"
                      placeholder="0x..."
                      error={errors.tokenAddress?.message}
                      helperText="Token contract address to vest"
                      {...register('tokenAddress')}
                      required
                    />
                  </div>

                  {/* Dynamic Recipients */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Recipients (max 20)</label>
                      <button
                        type="button"
                        onClick={() => append({ beneficiary: '', amount: '' })}
                        disabled={fields.length >= 20}
                        className="btn-secondary text-xs"
                      >
                        Add Recipient
                      </button>
                    </div>

                    {fields.map((field, idx) => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-7">
                          <FormField
                            label={`Beneficiary ${idx + 1}`}
                            placeholder="0x..."
                            error={errors.recipients?.[idx]?.beneficiary?.message}
                            helperText={idx === 0 ? 'Address that will receive the vested tokens' : undefined}
                            {...register(`recipients.${idx}.beneficiary`)}
                            required
                          />
                        </div>
                        <div className="md:col-span-4">
                          <FormField
                            label={`Amount${tokenSymbol ? ` (${tokenSymbol})` : ''}`}
                            error={errors.recipients?.[idx]?.amount?.message}
                            helperText={idx === 0 && vestedTokenAddress ? `Available: ${walletBalanceFormatted}${tokenSymbol ? ` ${tokenSymbol}` : ''}` : undefined}
                            inputMode="decimal"
                            pattern="^\\d*(?:\\.\\d*)?$"
                            {...register(`recipients.${idx}.amount`)}
                            required
                          />
                        </div>
                        <div className="md:col-span-1 flex md:justify-center">
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(idx)}
                              className="p-2 text-red-600 hover:text-red-800"
                              aria-label="Remove recipient"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <FormField
                    label="Cliff Months"
                    error={errors.cliffMonths?.message}
                    helperText="Number of months before vesting starts (0 for immediate vesting)"
                    {...register('cliffMonths')}
                    required
                  />

                  <FormField
                    label="Duration Months"
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

                  <div className="md:col-span-2 space-y-2">
                    {/* Advanced Custom Release (optional) */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <label className="flex items-center gap-2 mb-3">
                        <input type="checkbox" {...register('advancedEnabled')} className="h-4 w-4" />
                        <span className="text-sm font-medium text-gray-900">Advanced custom release (optional)</span>
                      </label>
                      {watch('advancedEnabled') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            label="First month unlock %"
                            placeholder="e.g. 50"
                            helperText="Percent of total that unlocks on first month (0-100)"
                            inputMode="decimal"
                            pattern="^\\d*(?:\\.\\d*)?$"
                            {...register('firstMonthPercent')}
                          />
                          <FormField
                            label="Subsequent monthly %"
                            placeholder="e.g. 10"
                            helperText="Percent per month after first month (0-100)"
                            inputMode="decimal"
                            pattern="^\\d*(?:\\.\\d*)?$"
                            {...register('subsequentMonthPercent')}
                          />
                        </div>
                      )}
                    </div>

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

          {/* Right: Helper Panel + Summary */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="card p-6 space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">Summary</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <div className="flex justify-between"><span>Token</span><span className="font-mono break-all">{vestedTokenAddress || '—'}</span></div>
                <div className="flex justify-between"><span>Recipients</span><span>{Array.isArray(recipientsWatch) ? recipientsWatch.length : 0}</span></div>
                <div className="flex justify-between"><span>Total</span><span>{totalAmountParsed !== null ? formatUnits(totalAmountParsed, decimals) : '—'} {tokenSymbol}</span></div>
                <div className="flex justify-between"><span>Cliff</span><span>{cliffMonthsNum} months</span></div>
                <div className="flex justify-between"><span>Duration</span><span>{durationMonthsNum} months</span></div>
                <div className="flex justify-between"><span>Vesting Months</span><span>{vestingMonths}</span></div>
                <div className="flex justify-between"><span>Monthly Release</span><span>{vestingMonths > 0 ? `${monthlyAmountFormatted} ${tokenSymbol}` : '—'}</span></div>
                <div className="flex justify-between"><span>Start</span><span>{startDate.toLocaleDateString()}</span></div>
                <div className="flex justify-between"><span>End (approx)</span><span>{endDate.toLocaleDateString()}</span></div>
              </div>
            </div>
              <div className="card p-6 space-y-4">
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
