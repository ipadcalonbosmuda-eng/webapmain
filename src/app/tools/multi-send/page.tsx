'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { RequireWallet } from '@/components/RequireWallet';
import { FormField } from '@/components/FormField';
import { FileDrop } from '@/components/FileDrop';
import { ToastContainer, type ToastProps, type ToastData } from '@/components/Toast';
import { explorerUrl, parseCSV, parseJSON, isValidAddress } from '@/lib/utils';
import multiSendAbi from '@/lib/abis/multiSend.json';
import { Plus, Trash2 } from 'lucide-react';

const multiSendSchema = z.object({
  recipients: z.array(z.object({
    address: z.string().min(42, 'Invalid address').max(42, 'Invalid address'),
    amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Amount must be a positive number'),
  })).min(1, 'At least one recipient is required'),
});

type MultiSendForm = z.infer<typeof multiSendSchema>;

interface Recipient {
  address: string;
  amount: string;
}

export default function MultiSendPage() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useSequential, setUseSequential] = useState(false);

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
    if (!process.env.NEXT_PUBLIC_MULTISEND) {
      addToast({
        type: 'error',
        title: 'Configuration Error',
        description: 'Multi-send contract address not configured',
      });
      return;
    }

    setIsLoading(true);
    try {
      const addresses = data.recipients.map(r => r.address as `0x${string}`);
      const amounts = data.recipients.map(r => BigInt(r.amount));

      if (useSequential) {
        // Sequential sending (fallback)
        for (let i = 0; i < addresses.length; i++) {
          writeContract({
            address: process.env.NEXT_PUBLIC_MULTISEND as `0x${string}`,
            abi: multiSendAbi,
            functionName: 'multiSend',
            args: [[addresses[i]], [amounts[i]]],
            value: amounts[i],
          });
        }
      } else {
        // Bulk sending
        writeContract({
          address: process.env.NEXT_PUBLIC_MULTISEND as `0x${string}`,
          abi: multiSendAbi,
          functionName: 'multiSend',
          args: [addresses, amounts],
          value: amounts.reduce((sum, amount) => sum + amount, BigInt(0)),
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Multi-Send</h1>
              <p className="text-gray-600">
                Send tokens to multiple addresses efficiently with a single transaction.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                    <div key={field.id} className="flex items-end space-x-3">
                      <div className="flex-1">
                        <FormField
                          label={`Recipient ${index + 1} Address`}
                          placeholder="0x..."
                          error={errors.recipients?.[index]?.address?.message}
                          {...register(`recipients.${index}.address`)}
                        />
                      </div>
                      <div className="flex-1">
                        <FormField
                          label="Amount"
                          placeholder="1000"
                          error={errors.recipients?.[index]?.amount?.message}
                          {...register(`recipients.${index}.amount`)}
                        />
                      </div>
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
                  ))}
                </div>
              </div>

              {/* Summary */}
              {recipients.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Summary</h4>
                  <p className="text-sm text-gray-600">
                    {recipients.length} recipients • Total amount: {totalAmount.toLocaleString()} tokens
                  </p>
                </div>
              )}

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

              <div className="pt-6">
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
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </RequireWallet>
  );
}
