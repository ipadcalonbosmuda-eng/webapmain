'use client';

import { useEffect, useMemo, useState } from 'react';
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
  totalAmount: z.string().min(1, 'Total amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Total amount must be a positive number'),
  recipients: z.array(z.object({
    beneficiary: z.string().min(42, 'Invalid beneficiary address').max(42, 'Invalid beneficiary address'),
  })).min(1, 'At least one recipient').max(20, 'Maximum 20 recipients'),
  durationValue: z.string().min(1, 'Duration is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Duration must be a positive number'),
  durationUnit: z.enum(['day','week','month','year']),
  unlockUnit: z.enum(['day','week','month','year']),
  advancedEnabled: z.boolean().optional(),
  advancedCliffValue: z.string().optional(),
  advancedCliffUnit: z.enum(['day','week','month','year']).optional(),
}).refine((data) => {
  const order = { day: 0, week: 1, month: 2, year: 3 } as const;
  return order[data.unlockUnit] <= order[data.durationUnit];
}, { message: 'Unlock frequency must be equal or shorter than duration', path: ['unlockUnit'] });

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
    setValue,
  } = useForm<VestingForm>({
    resolver: zodResolver(vestingSchema),
    defaultValues: {
      tokenAddress: '',
      totalAmount: '',
      recipients: [{ beneficiary: address || '' }],
      durationValue: '1',
      durationUnit: 'month',
      unlockUnit: 'month',
      advancedEnabled: false,
      advancedCliffValue: '',
      advancedCliffUnit: 'month',
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

  // Try to read ERC20 name for friendlier display
  const { data: tokenNameData } = useReadContract({
    address: vestedTokenAddress,
    abi: [
      { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
    ],
    functionName: 'name',
    query: { enabled: !!vestedTokenAddress },
  });
  const tokenName = (tokenNameData as unknown as string) ?? '';

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
      return parseUnitsSafe(watch('totalAmount'), decimals);
    } catch {
      return null;
    }
  })();

  const durationUnit = (watch('durationUnit') as 'day'|'week'|'month'|'year');
  const releaseUnit = (watch('unlockUnit') as 'day'|'week'|'month'|'year');
  const orderMap = { day: 0, week: 1, month: 2, year: 3 } as const;
  const allUnits: Array<'day'|'week'|'month'|'year'> = ['day','week','month','year'];
  const allowedUnlockUnits = allUnits.filter((u) => orderMap[u] <= orderMap[durationUnit]);
  const SECONDS_PER_DAY = 24 * 60 * 60;
  const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;
  const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY;
  const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;
  const unitSeconds = releaseUnit === 'day' ? SECONDS_PER_DAY : releaseUnit === 'week' ? SECONDS_PER_WEEK : releaseUnit === 'year' ? SECONDS_PER_YEAR : SECONDS_PER_MONTH;

  // Default cliff: 1 interval of unlock unit unless advanced override provided
  const advancedCliffVal = Number(watch('advancedCliffValue') || 0) || 0;
  const advancedCliffUnit = (watch('advancedCliffUnit') as 'day'|'week'|'month'|'year');
  const cliffMonthsVal = (() => {
    if (!watch('advancedEnabled') || !advancedCliffVal) {
      // default: no cliff when advanced is off or value empty
      return 0;
    }
    if (advancedCliffUnit === 'day') return advancedCliffVal / 30;
    if (advancedCliffUnit === 'week') return (advancedCliffVal * 7) / 30;
    if (advancedCliffUnit === 'year') return advancedCliffVal * 12;
    return advancedCliffVal; // month
  })();
  const durationVal = Number(watch('durationValue') || 0) || 0;
  const durationMonthsVal = (() => {
    if (durationUnit === 'day') return durationVal / 30;
    if (durationUnit === 'week') return (durationVal * 7) / 30;
    if (durationUnit === 'year') return durationVal * 12;
    return durationVal; // month
  })();
  const cliffPeriods = Math.max(0, Math.floor((cliffMonthsVal * SECONDS_PER_MONTH) / unitSeconds));
  const totalPeriods = Math.max(0, Math.floor((durationMonthsVal * SECONDS_PER_MONTH) / unitSeconds));
  const vestingPeriods = Math.max(0, totalPeriods - cliffPeriods);
  const perIntervalAmount = vestingPeriods > 0 && totalAmountParsed ? (totalAmountParsed / BigInt(vestingPeriods)) : null;
  const perIntervalAmountFormatted = perIntervalAmount !== null ? (() => { try { const num = Number(formatUnits(perIntervalAmount, decimals)); return num.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }); } catch { return perIntervalAmount.toString(); } })() : '-';
  const now = Date.now();
  const startDate = new Date(now);
  const endDate = new Date(now + durationMonthsVal * SECONDS_PER_MONTH * 1000);
  const fmt = (d: Date) => {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = monthNames[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd} ${mon} ${yyyy}, ${hh}:${mm} UTC`;
  };
  const fmtAmount = (a: bigint) => {
    try {
      const raw = Number(formatUnits(a, decimals));
      return raw.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    } catch {
      return a.toString();
    }
  };

  // Enforce unlockUnit not coarser than durationUnit
  useEffect(() => {
    const currUnlock = watch('unlockUnit') as 'day'|'week'|'month'|'year';
    if (orderMap[currUnlock] > orderMap[durationUnit]) {
      setValue('unlockUnit', durationUnit);
    }
  }, [durationUnit, setValue, watch]);

  // Build preview unlock schedule (client-side)
  const schedulePreview = useMemo(() => {
    if (!vestingPeriods || vestingPeriods <= 0) return [] as Array<{ t: number; amount: bigint }>;
    if (!totalAmountParsed || typeof totalAmountParsed !== 'bigint') return [] as Array<{ t: number; amount: bigint }>;
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec + Math.max(0, Math.floor(cliffMonthsVal * SECONDS_PER_MONTH)) * 1; // cliff already in months
    const base = totalAmountParsed / BigInt(vestingPeriods);
    let remainder = totalAmountParsed - base * BigInt(vestingPeriods);
    const out: Array<{ t: number; amount: bigint }> = [];
    for (let i = 0; i < vestingPeriods; i++) {
      const extra = remainder > BigInt(0) ? BigInt(1) : BigInt(0);
      if (remainder > BigInt(0)) remainder -= BigInt(1);
      out.push({ t: startSec + unitSeconds * (i + 1), amount: base + extra });
    }
    return out;
  }, [vestingPeriods, totalAmountParsed, unitSeconds, cliffMonthsVal]);

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
      const targets = (data.recipients || []);
      if (targets.length === 0) {
        addToast({ type: 'error', title: 'Invalid recipients', description: 'Please add at least one valid recipient and amount.' });
        return;
      }
      const totalUnits = parseUnitsSafe(data.totalAmount, decimals);
      if (totalUnits === null) {
        addToast({ type: 'error', title: 'Invalid amount', description: 'Please enter a valid total amount.' });
        return;
      }
      const count = targets.length;
      const baseShare = totalUnits / BigInt(count);
      let remainder = totalUnits - baseShare * BigInt(count);
      for (let idx = 0; idx < targets.length; idx++) {
        const r = targets[idx];
        const extra = remainder > BigInt(0) ? BigInt(1) : BigInt(0);
        const amountEach = baseShare + extra;
        if (remainder > BigInt(0)) remainder -= BigInt(1);
        const custom: Array<{ timestamp: bigint; amount: bigint; claimed: boolean }> = [];
        if (watch('advancedEnabled')) {
          // advanced cliff only; no percent logic now
          if (true) {
            const totalPeriodsLocal = Math.max(0, Math.floor((durationMonthsVal * SECONDS_PER_MONTH) / unitSeconds));
            const firstAmt = BigInt(0);
            const remaining = amountEach - firstAmt;
            const periodsAfterFirst = Math.max(0, totalPeriodsLocal - cliffPeriods - 1);
            const perAmt = periodsAfterFirst > 0 ? (remaining / BigInt(periodsAfterFirst)) : BigInt(0);
            let sum = firstAmt;
            // Build releases: first month
            const nowSec = Math.floor(Date.now() / 1000);
            // Subsequent intervals after cliff (even if firstAmt=0)
            for (let i = 0; i < periodsAfterFirst + 1; i++) {
              if (perAmt === BigInt(0)) break;
              const isLast = i === periodsAfterFirst;
              const amt = isLast ? (amountEach - sum) : perAmt;
              if (amt > BigInt(0)) {
                custom.push({ timestamp: BigInt(nowSec + cliffPeriods * unitSeconds + unitSeconds * (i + 1)), amount: amt, claimed: false });
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
            BigInt(Math.max(0, Math.ceil(cliffMonthsVal))),
            BigInt(Math.max(1, Math.ceil(durationMonthsVal))),
            0,
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

                  {/* Total Amount */}
                  <div className="md:col-span-2">
                    <FormField
                      label={`Total Amount${tokenSymbol ? ` (${tokenSymbol})` : ''}`}
                      error={errors.totalAmount?.message}
                      helperText={vestedTokenAddress ? `Available: ${walletBalanceFormatted}${tokenSymbol ? ` ${tokenSymbol}` : ''}` : ''}
                      inputMode="decimal"
                      pattern="^\\d*(?:\\.\\d*)?$"
                      {...register('totalAmount')}
                      required
                    />
                  </div>

                  {/* Dynamic Recipients */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Recipients (max 20)</label>
                      <button
                        type="button"
                        onClick={() => append({ beneficiary: '' })}
                        disabled={fields.length >= 20}
                        className="btn-secondary text-xs"
                      >
                        Add Recipient
                      </button>
                    </div>

                    {fields.map((field, idx) => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-11">
                          <FormField
                            label={`Beneficiary ${idx + 1}`}
                            placeholder="0x..."
                            error={errors.recipients?.[idx]?.beneficiary?.message}
                            helperText={idx === 0 ? 'Address that will receive the vested tokens' : undefined}
                            {...register(`recipients.${idx}.beneficiary`)}
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

                  

                  {/* Vesting Duration (value + unit) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:col-span-2">
                    <div className="md:col-span-6">
                      <FormField
                        label="Vesting Duration"
                        error={errors.durationValue?.message}
                        helperText="Length of the vesting schedule"
                        inputMode="decimal"
                        pattern="^\\d*(?:\\.\\d*)?$"
                        {...register('durationValue')}
                        required
                      />
                    </div>
                    <div className="md:col-span-6 flex flex-col justify-end">
                      <label className="block text-sm font-medium text-gray-700 mt-[22px]">&nbsp;</label>
                      <select
                        {...register('durationUnit')}
                        className="w-full h-12 px-4 rounded-md bg-gray-100 text-black border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-500 transition-colors"
                      >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                      </select>
                    </div>
                  </div>

                  {/* Unlock schedule under duration */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Unlock Every</label>
                    <select
                      {...register('unlockUnit')}
                      className="w-full h-12 px-4 rounded-md bg-gray-100 text-black border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-500 transition-colors"
                    >
                      {allowedUnlockUnits.map((u) => (
                        <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                      ))}
                    </select>
                    {errors.unlockUnit && (
                      <p className="text-sm text-red-600">{errors.unlockUnit.message as string}</p>
                    )}
                  </div>

                  

                  <div className="md:col-span-2 space-y-2">
                    {/* Advanced settings (optional) */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <label className="flex items-center gap-2 mb-3">
                        <input type="checkbox" {...register('advancedEnabled')} className="h-4 w-4" />
                        <span className="text-sm font-medium text-gray-900">Advanced settings (optional)</span>
                      </label>
                      {watch('advancedEnabled') && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                          <div className="md:col-span-6">
                            <FormField
                              label="Cliff"
                              placeholder="e.g. 1"
                              helperText="Delay before vesting starts"
                              inputMode="decimal"
                              pattern="^\\d*(?:\\.\\d*)?$"
                              {...register('advancedCliffValue')}
                            />
                          </div>
                          <div className="md:col-span-6 flex flex-col justify-end">
                            <label className="block text-sm font-medium text-gray-700 mt-[22px]">&nbsp;</label>
                            <select
                              {...register('advancedCliffUnit')}
                              className="w-full h-12 px-4 rounded-md bg-gray-100 text-black border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-500 transition-colors"
                            >
                              <option value="day">Day</option>
                              <option value="week">Week</option>
                              <option value="month">Month</option>
                              <option value="year">Year</option>
                            </select>
                          </div>
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
                <div className="flex justify-between"><span>Token</span><span className="font-mono break-all">{tokenName || tokenSymbol || vestedTokenAddress || '—'}</span></div>
                <div className="flex justify-between"><span>Recipients</span><span>{Array.isArray(recipientsWatch) ? recipientsWatch.length : 0}</span></div>
                <div className="flex justify-between"><span>Total</span><span>{totalAmountParsed !== null ? formatUnits(totalAmountParsed, decimals) : '—'} {tokenSymbol}</span></div>
                <div className="flex justify-between"><span>Cliff</span><span>{cliffMonthsVal > 0 ? `${cliffMonthsVal} month(s)` : '—'}</span></div>
                <div className="flex justify-between"><span>Duration</span><span>{durationVal} {durationUnit}</span></div>
                <div className="flex justify-between"><span>Vesting Periods</span><span>{vestingPeriods}</span></div>
                <div className="flex justify-between"><span>Per-interval Release</span><span>{vestingPeriods > 0 ? `${perIntervalAmountFormatted} ${tokenSymbol}` : '—'}</span></div>
                <div className="flex justify-between"><span>Start</span><span>{fmt(startDate)}</span></div>
                <div className="flex justify-between"><span>End (approx)</span><span>{fmt(endDate)}</span></div>
              </div>
            </div>
            {/* Claim schedule preview (first/last only) */}
            {schedulePreview.length > 0 && (
              <div className="card p-6 space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Unlock Schedule Preview</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <div className="flex justify-between"><span>First unlock</span><span>{fmt(new Date(schedulePreview[0].t * 1000))} — {fmtAmount(schedulePreview[0].amount)} {tokenSymbol}</span></div>
                  <div className="flex justify-between"><span>Last unlock</span><span>{fmt(new Date(schedulePreview[schedulePreview.length - 1].t * 1000))} — {fmtAmount(schedulePreview[schedulePreview.length - 1].amount)} {tokenSymbol}</span></div>
                </div>
              </div>
            )}
              <div className="card p-6 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Guidelines</h3>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>`Cliff` is the delay before vesting starts.</li>
                  <li>`Duration` is the total length of the vesting schedule.</li>
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
