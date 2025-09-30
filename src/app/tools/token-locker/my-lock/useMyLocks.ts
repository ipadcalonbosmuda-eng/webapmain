"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import tokenLockerAbi from "@/lib/abis/tokenLocker.json";
import { formatUnits } from "viem";

export type MyLock = {
  lockId: bigint;
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  amount: bigint;
  withdrawn: bigint;
  unlockAt: bigint;
  owner: `0x${string}`;
  withdrawable: bigint;
};

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_LOCKER || "0xEb929E58B57410DC4f22cCDBaEE142Cb441B576C") as `0x${string}`;

export function useMyLocks() {
  const { address } = useAccount();
  const client = usePublicClient();

  const [locks, setLocks] = useState<MyLock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address || !client) {
        setLocks([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const lockIds = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: tokenLockerAbi as any,
          functionName: "locksOf",
          args: [address],
        })) as bigint[];

        const result: MyLock[] = [];
        for (const id of lockIds) {
          const [info, w, dec, sym] = await Promise.all([
            client.readContract({
              address: CONTRACT_ADDRESS,
              abi: tokenLockerAbi as any,
              functionName: "locks",
              args: [id],
            }) as Promise<{ token: `0x${string}`; amount: bigint; withdrawn: bigint; lockUntil: bigint; owner: `0x${string}` }>,
            client.readContract({
              address: CONTRACT_ADDRESS,
              abi: tokenLockerAbi as any,
              functionName: "withdrawable",
              args: [id],
            }) as Promise<bigint>,
            client.readContract({
              address: undefined as any,
              abi: [
                { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
              ],
              functionName: "decimals",
              // viem requires address typed; we cast since it's dynamic
              address: info?.token as any,
            }) as Promise<number>,
            client.readContract({
              address: undefined as any,
              abi: [
                { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
              ],
              functionName: "symbol",
              address: info?.token as any,
            }) as Promise<string>,
          ]);

          result.push({
            lockId: id,
            token: info.token,
            symbol: sym || "",
            decimals: Number(dec ?? 18),
            amount: info.amount,
            withdrawn: info.withdrawn,
            unlockAt: info.lockUntil,
            owner: info.owner,
            withdrawable: w,
          });
        }
        if (!cancelled) setLocks(result);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [address, client]);

  return { locks, loading, error };
}


