import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, length = 6): string {
  if (!address) return '';
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

export function explorerUrl(address: string, txHash?: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_EXPLORER || 'https://plasmascan.to';
  if (txHash) {
    return `${baseUrl}/tx/${txHash}`;
  }
  return `${baseUrl}/address/${address}`;
}

// Helper: format chain config for viem/wagmi if needed elsewhere
export const PLASMA_CHAIN = {
  id: 9745,
  name: 'Plasma Mainnet Beta',
  rpcUrl: 'https://rpc.plasma.to',
  explorer: 'https://plasmascan.to',
};

export function parseCSV(csvText: string): Array<{ address: string; amount: string }> {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const addressIndex = headers.findIndex(h => h.includes('address') || h.includes('wallet'));
  const amountIndex = headers.findIndex(h => h.includes('amount') || h.includes('value') || h.includes('quantity'));
  
  if (addressIndex === -1 || amountIndex === -1) {
    throw new Error('CSV must contain "address" and "amount" columns');
  }
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return {
      address: values[addressIndex],
      amount: values[amountIndex],
    };
  });
}

export function parseJSON(jsonText: string): Array<{ address: string; amount: string }> {
  const data = JSON.parse(jsonText);
  
  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of objects');
  }
  
  return data.map(item => {
    if (!item.address || !item.amount) {
      throw new Error('Each item must have "address" and "amount" properties');
    }
    return {
      address: item.address,
      amount: item.amount.toString(),
    };
  });
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
