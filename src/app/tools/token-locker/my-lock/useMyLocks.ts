"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import tokenLockerAbi from "@/lib/abis/tokenLocker.json";
import type { Abi } from "viem";
import { parseAbiItem } from "viem";

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
        const abi = tokenLockerAbi as unknown as Abi;
        let lockIds = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi,
          functionName: "locksOf",
          args: [address],
        })) as bigint[];
        console.log('[MyLock] locksOf ->', lockIds?.length);

        // Fallback A: if locksOf returns empty (older deployments), scan all locks by nextLockId
        if (!lockIds || lockIds.length === 0) {
          const maxId = (await client.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: "nextLockId",
          })) as bigint;
          console.log('[MyLock] nextLockId ->', String(maxId));
          const allIds: bigint[] = [];
          for (let i = BigInt(1); i <= maxId; i = i + BigInt(1)) allIds.push(i);
          lockIds = allIds;
        }

        // Fallback B: if still nothing after scanning (or contract is huge), read event logs for owner
        if (!lockIds || lockIds.length === 0) {
          const event = parseAbiItem(
            'event Locked(uint256 indexed lockId, address indexed owner, address indexed token, uint256 amount, uint256 lockUntil)'
          );
          const logs = (await client.getLogs({
            address: CONTRACT_ADDRESS,
            event,
            args: { owner: address },
            fromBlock: BigInt(2289855),
            toBlock: "latest",
          })) as unknown as Array<{ args: { lockId: bigint } }>;
          lockIds = logs.map((l) => l.args.lockId);
          console.log('[MyLock] logs(owner) ->', lockIds.length);
          if (!lockIds || lockIds.length === 0) {
            const allLogs = (await client.getLogs({
              address: CONTRACT_ADDRESS,
              event,
              fromBlock: BigInt(2289855),
              toBlock: "latest",
            })) as unknown as Array<{ args: { lockId: bigint; owner: `0x${string}` } }>;
            lockIds = allLogs.filter((l) => l.args && String(l.args.owner).toLowerCase() === address.toLowerCase()).map((l) => l.args.lockId);
            console.log('[MyLock] logs(all) filtered ->', lockIds.length);
          }
        }

        const result: MyLock[] = [];
        for (const id of lockIds) {
          type LockInfo = { token: `0x${string}`; amount: bigint; withdrawn: bigint; lockUntil: bigint; owner: `0x${string}` };
          const infoRaw = (await client.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: "locks",
            args: [id],
          })) as unknown;
          // Handle tuple or object return shape
          const info: LockInfo = ((): LockInfo => {
            if (infoRaw && typeof infoRaw === 'object' && !Array.isArray(infoRaw) && 'owner' in (infoRaw as Record<string, unknown>)) {
              const obj = infoRaw as Record<string, unknown>;
              return {
                token: obj.token as `0x${string}`,
                amount: obj.amount as bigint,
                withdrawn: obj.withdrawn as bigint,
                lockUntil: obj.lockUntil as bigint,
                owner: obj.owner as `0x${string}`,
              };
            }
            const arr = infoRaw as unknown as Array<unknown>;
            return {
              token: arr?.[0] as `0x${string}`,
              amount: arr?.[1] as bigint,
              withdrawn: arr?.[2] as bigint,
              lockUntil: arr?.[3] as bigint,
              owner: arr?.[4] as `0x${string}`,
            };
          })();
          console.log('[MyLock] lock', String(id), 'owner', info.owner);

          // Skip locks that don't belong to the current user (in case of fallback scan)
          if (info.owner.toLowerCase() !== address.toLowerCase()) {
            continue;
          }

          // Read withdrawable/metadata defensively; do not fail whole list if one read throws
          let w: bigint = BigInt(0);
          try {
            w = (await client.readContract({
              address: CONTRACT_ADDRESS,
              abi,
              functionName: "withdrawable",
              args: [id],
            })) as bigint;
          } catch {
            w = BigInt(0);
          }

          let decNum = 18;
          try {
            const dec = (await client.readContract({
              address: info?.token as `0x${string}`,
              abi: [
                { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
              ] as unknown as Abi,
              functionName: "decimals",
            })) as number;
            decNum = Number(dec ?? 18);
          } catch {
            decNum = 18;
          }

          let symStr = "";
          try {
            const sym = (await client.readContract({
              address: info?.token as `0x${string}`,
              abi: [
                { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
              ] as unknown as Abi,
              functionName: "symbol",
            })) as string;
            symStr = sym ?? "";
          } catch {
            symStr = "";
          }

          result.push({
            lockId: id,
            token: info.token,
            symbol: symStr,
            decimals: decNum,
            amount: info.amount,
            withdrawn: info.withdrawn,
            unlockAt: info.lockUntil,
            owner: info.owner,
            withdrawable: w,
          });
        }
        if (!cancelled) setLocks(result);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
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


