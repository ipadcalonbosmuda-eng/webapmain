'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { FileDrop } from '@/components/FileDrop';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl, parseCSV, parseJSON, isValidAddress } from '@/lib/utils';
import multiSendAbi from '@/lib/abis/multiSend.json';
import { Plus, Trash2 } from 'lucide-react';

const multiSendSchema = z.object({
  tokenAddress: z.string().optional(),
  tokenType: z.enum(['native', 'prc20']).default('native'),
  recipients: z.array(z.object({
    address: z.string().min(42, 'Invalid address').max(42, 'Invalid address'),
    amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  })).min(1, 'At least one recipient is required'),
}).refine((data) => {
  if (data.tokenType === 'prc20' && !data.tokenAddress) {
    return false;
  }
  return true;
}, {
  message: 'Token address is required for tokens',
  path: ['tokenAddress'],
});

type MultiSendForm = z.infer<typeof multiSendSchema>;

interface Recipient {
  address: string;
  amount: string;
}

export default function MultiSendPage() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useSequential, setUseSequential] = useState(true); // Default to sequential for native tokens
  const { address } = useAccount();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<MultiSendForm>({
    resolver: zodResolver(multiSendSchema),
    defaultValues: {
      tokenType: 'native',
      tokenAddress: '',
      recipients: [{ address: '', amount: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'recipients',
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const recipients = watch('recipients');

  const addToast = (toast: ToastData) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleFileSelect = async (file: File) => {
    try {
      const text = await file.text();
      let parsedRecipients: Recipient[];

      if (file.name.endsWith('.csv')) {
        parsedRecipients = parseCSV(text);
      } else if (file.name.endsWith('.json')) {
        parsedRecipients = parseJSON(text);
      } else {
        throw new Error('Unsupported file type');
      }

      // Validate addresses
      const validRecipients = parsedRecipients.filter(recipient => {
        if (!isValidAddress(recipient.address)) {
          addToast({
            type: 'error',
            title: 'Invalid Address',
            description: `Invalid address: ${recipient.address}`,
          });
          return false;
        }
        return true;
      });

      if (validRecipients.length === 0) {
        addToast({
          type: 'error',
          title: 'No Valid Recipients',
          description: 'No valid addresses found in the file.',
        });
        return;
      }

      setValue('recipients', validRecipients);
      addToast({
        type: 'success',
        title: 'File Processed',
        description: `Loaded ${validRecipients.length} recipients from ${file.name}`,
      });
    } catch (error) {
      console.error('Error processing file:', error);
      addToast({
        type: 'error',
        title: 'File Processing Error',
        description: error instanceof Error ? error.message : 'Failed to process file',
      });
    }
  };

  const onSubmit = async (data: MultiSendForm) => {
    if (!address) {
      addToast({
        type: 'error',
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet first.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const addresses = data.recipients.map(r => r.address as `0x${string}`);
      const amounts = data.recipients.map(r => BigInt(r.amount));

      if (data.tokenType === 'native') {
        // Native token (XPL) sending - sequential transfers
        addToast({
          type: 'info',
          title: 'Starting Multi-Send',
          description: `Sending XPL to ${addresses.length} recipients sequentially...`,
        });

        // For now, we'll show instructions for manual sending
        // In a real implementation, you'd want to use a proper multi-send contract
        addToast({
          type: 'info',
          title: 'Multi-Send Instructions',
          description: 'For native token multi-send, please use a multi-send contract or send transactions individually. This feature requires a deployed multi-send contract on Plasma Mainnet Beta.',
        });
        
        // Show the transactions that would be sent
        const totalAmount = amounts.reduce((sum, amount) => sum + amount, BigInt(0));
        addToast({
          type: 'success',
          title: 'Multi-Send Summary',
          description: `Would send ${totalAmount.toString()} XPL to ${addresses.length} recipients. Please deploy a multi-send contract for automated sending.`,
        });

      } else {
        // PRC-20 token sending
        if (!data.tokenAddress) {
          addToast({
            type: 'error',
            title: 'Token Address Required',
            description: 'Please provide a valid token contract address.',
          });
          return;
        }

        addToast({
          type: 'info',
          title: 'Token Multi-Send',
          description: 'Token multi-send requires a deployed multi-send contract. Please contact support for contract deployment.',
        });
      }
    } catch (error) {
      console.error('Error sending tokens:', error);
      addToast({
        type: 'error',
        title: 'Transaction Failed',
        description: 'Failed to send tokens. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess && hash) {
    addToast({
      type: 'success',
      title: 'Tokens Sent Successfully!',
      description: `Sent tokens to ${recipients.length} recipients.`,
    });
  }

  const totalAmount = recipients.reduce((sum, recipient) => sum + Number(recipient.amount || 0), 0);

  return (
    <RequireWallet>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Multi-Send</h1>
            <p className="text-gray-600">
              Send tokens to multiple addresses efficiently with a single transaction.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-8">
              <div className="card p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  {/* Token Selection */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Token Selection</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Token Type
                        </label>
                        <select
                          {...register('tokenType')}
                          className="w-full h-12 px-4 rounded-md bg-gray-100 text-black border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-500 transition-colors"
                        >
                          <option value="native">Native Token (XPL)</option>
                          <option value="prc20">Token</option>
                        </select>
                      </div>
                      {watch('tokenType') === 'prc20' && (
                        <div>
                          <FormField
                            label="Token Address"
                            placeholder="0x..."
                            error={errors.tokenAddress?.message}
                            {...register('tokenAddress')}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File Upload Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Upload Recipients</h3>
                    <FileDrop
                      onFileSelect={handleFileSelect}
                      acceptedTypes={['.csv', '.json']}
                      maxSize={5}
                    />
                    <p className="text-sm text-gray-500">
                      Upload a CSV or JSON file with address and amount columns. CSV format: address,amount
                    </p>
                  </div>

                  {/* Manual Entry Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Manual Entry</h3>
                      <button
                        type="button"
                        onClick={() => append({ address: '', amount: '' })}
                        className="btn-secondary text-sm"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Recipient
                      </button>
                    </div>

                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-6">
                            <FormField
                              label={`Recipient ${index + 1} Address`}
                              placeholder="0x..."
                              error={errors.recipients?.[index]?.address?.message}
                              {...register(`recipients.${index}.address`)}
                            />
                          </div>
                          <div className="md:col-span-5">
                            <FormField
                              label="Amount"
                              placeholder="1000"
                              error={errors.recipients?.[index]?.amount?.message}
                              {...register(`recipients.${index}.amount`)}
                            />
                          </div>
                          <div className="md:col-span-1 flex items-end">
                            {fields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                className="p-2 text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Options</h3>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={useSequential}
                        onChange={(e) => setUseSequential(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">
                        Use sequential sending (fallback if bulk sending fails)
                      </span>
                    </label>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading || isPending || isConfirming || recipients.length === 0}
                      className="btn-primary w-full py-3 text-lg"
                    >
                      {isLoading || isPending || isConfirming ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                          {isLoading ? 'Preparing...' : isPending ? 'Confirming...' : 'Processing...'}
                        </div>
                      ) : (
                        `Send to ${recipients.length} Recipients`
                      )}
                    </button>
                  </div>
                </form>

                {isSuccess && hash && (
                  <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Tokens Sent Successfully!</h3>
                    <p className="text-green-700 mb-4">
                      Sent tokens to {recipients.length} recipients.
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

            {/* Right: Summary Panel */}
            <div className="lg:col-span-4">
              <div className="card p-6 lg:sticky lg:top-24 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Summary</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Token Type</p>
                  <p className="text-lg font-bold text-gray-900">
                    {watch('tokenType') === 'native' ? 'Native (XPL)' : 'Token'}
                  </p>
                  <p className="text-sm text-gray-600 mt-4">Recipients</p>
                  <p className="text-2xl font-bold text-gray-900">{recipients.length}</p>
                  <p className="text-sm text-gray-600 mt-4">Estimated Total</p>
                  <p className="text-2xl font-bold text-gray-900">{totalAmount.toLocaleString()} tokens</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">Important Note</h4>
                  <p className="text-sm text-blue-700">
                    Multi-send requires a deployed multi-send contract on Plasma Mainnet Beta. 
                    Currently showing preview mode - contact support for contract deployment.
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  Import supports CSV and JSON. Ensure amounts are in token units.
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
