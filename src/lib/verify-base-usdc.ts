/**
 * Verify a Base mainnet transaction is a USDC transfer to the treasury
 * for at least the required amount (bounty + collateral). USDC on Base has 6 decimals.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Native USDC on Base (Circle)
export const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6;

export type VerifyResult =
  | { valid: true; from: string; to: string; valueUsdc: number }
  | { valid: false; error: string };

/**
 * Verify that txHash is a confirmed USDC transfer on Base from `expectedFrom`
 * to `expectedTo` (treasury) with value >= requiredUsdc (human units, e.g. 10.5 USDC).
 */
export async function verifyBaseUsdcTransfer(params: {
  txHash: `0x${string}`;
  expectedFrom: string;
  expectedTo: string;
  requiredUsdc: number;
  rpcUrl?: string;
}): Promise<VerifyResult> {
  const rpcUrl = params.rpcUrl || process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const txHash = params.txHash;
  const expectedFrom = params.expectedFrom.toLowerCase();
  const expectedTo = params.expectedTo.toLowerCase();
  const requiredRaw = BigInt(Math.ceil(params.requiredUsdc * 10 ** USDC_DECIMALS));

  // Retry getting receipt with exponential backoff (transaction may not be confirmed yet)
  let receipt: any = null;
  const maxRetries = 10;
  const initialDelay = 1000; // 1 second
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) break; // Found receipt, exit retry loop
    } catch (e) {
      const isNotFound = e instanceof Error && (
        e.message.includes("could not be found") ||
        e.message.includes("not processed") ||
        e.message.includes("Transaction receipt")
      );
      if (!isNotFound) {
        // Not a "not found" error, rethrow
        throw e;
      }
      // Transaction not confirmed yet, wait and retry
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s, 8s...
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  try {
    if (!receipt || receipt.status !== "success") {
      return { valid: false, error: "Transaction not found or failed. Please wait a moment and try again." };
    }

    const logs = receipt.logs;
    // USDC Transfer topic: keccak256("Transfer(address,address,uint256)")
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const usdcLogs = logs.filter(
      (l: { address: string; topics: string[] }) => l.address.toLowerCase() === USDC_BASE_ADDRESS.toLowerCase() && l.topics[0] === transferTopic
    );

    if (usdcLogs.length === 0) {
      return { valid: false, error: "No USDC Transfer event found in this transaction." };
    }

    // Sum all USDC transfers to the treasury in this tx (in case of multiple logs)
    let totalToTreasury = 0n;
    let fromAddress: string | null = null;

    for (const log of usdcLogs) {
      if (log.topics.length !== 3) continue;
      const t1 = log.topics[1]; // 32-byte hex (0x + 64 chars)
      const t2 = log.topics[2];
      const from = (`0x${t1.length === 66 ? t1.slice(-40) : t1.slice(26)}`).toLowerCase();
      const to = (`0x${t2.length === 66 ? t2.slice(-40) : t2.slice(26)}`).toLowerCase();
      const value = BigInt(log.data);
      if (to === expectedTo) {
        totalToTreasury += value;
        if (!fromAddress) fromAddress = from;
      }
    }

    if (totalToTreasury < requiredRaw) {
      return {
        valid: false,
        error: `Insufficient USDC transfer. Required ${params.requiredUsdc} USDC, got ${Number(totalToTreasury) / 10 ** USDC_DECIMALS} USDC.`,
      };
    }
    if (fromAddress && fromAddress !== expectedFrom) {
      return {
        valid: false,
        error: `Transfer from ${fromAddress} does not match poster wallet ${params.expectedFrom}.`,
      };
    }
    if (!fromAddress) {
      return { valid: false, error: "Could not determine sender from USDC transfer." };
    }

    return {
      valid: true,
      from: fromAddress,
      to: expectedTo,
      valueUsdc: Number(totalToTreasury) / 10 ** USDC_DECIMALS,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("could not be found") || message.includes("not processed")) {
      return { valid: false, error: "Transaction not confirmed yet. Please wait a few seconds and try submitting again, or check the transaction on BaseScan." };
    }
    return { valid: false, error: `Verification failed: ${message}` };
  }
}

/** Collateral for base-usdc: 0 — anonymous posters have no account/withdraw UI, so we don't take collateral. */
export const BASE_USDC_COLLATERAL = 0;
