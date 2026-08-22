import "server-only";
import { Address, beginCell, Cell } from "@ton/core";
import { redis, isRedisConfigured } from "./redis";

const TONAPI_BASE = process.env.TONAPI_BASE_URL || "https://tonapi.io";
const TONAPI_KEY = process.env.TONAPI_KEY;
const PLATFORM_TON_ADDRESS = process.env.TON_PLATFORM_WALLET_ADDRESS;

const USDT_JETTON_MASTER_ADDRESS =
  process.env.TON_USDT_JETTON_MASTER_ADDRESS || "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

const PLATFORM_USDT_JETTON_WALLET_ADDRESS = process.env.TON_PLATFORM_USDT_WALLET_ADDRESS;

const USDT_DECIMALS = 6;
const JETTON_TRANSFER_OPCODE = 0x0f8a7ea5;
const JETTON_TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;

export const JETTON_TRANSFER_GAS_NANOTON = 60_000_000n; 
export const JETTON_FORWARD_NANOTON = 20_000_000n; 

export function isTonConfigured(): boolean {
  return Boolean(PLATFORM_TON_ADDRESS);
}

export function getPlatformTonAddress(): string {
  if (!PLATFORM_TON_ADDRESS) throw new Error("TON_PLATFORM_WALLET_ADDRESS تنظیم نشده است");
  return PLATFORM_TON_ADDRESS;
}

export function getPlatformUsdtJettonWalletAddress(): string {
  if (!PLATFORM_USDT_JETTON_WALLET_ADDRESS) {
    throw new Error(
      "TON_PLATFORM_USDT_WALLET_ADDRESS تنظیم نشده — آدرس کیف‌پول جتون تتر پلتفرم را یک‌بار پیدا و در env ثبت کن."
    );
  }
  return PLATFORM_USDT_JETTON_WALLET_ADDRESS;
}

export function usdtToJettonUnits(amountUsdt: number): bigint {
  return BigInt(Math.round(amountUsdt * 10 ** USDT_DECIMALS));
}

export function generateTonComment(transactionId: string): string {
  return `manavi-${transactionId}`;
}

export class TonVerificationError extends Error {}

const JETTON_WALLET_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function getJettonWalletAddress(
  ownerAddress: string,
  jettonMasterAddress: string = USDT_JETTON_MASTER_ADDRESS
): Promise<string> {
  const cacheKey = `jetton-wallet:${jettonMasterAddress}:${ownerAddress}`;

  if (isRedisConfigured) {
    try {
      const cached = await redis.get<string>(cacheKey);
      if (cached) return cached;
    } catch {}
  }

  const url = `${TONAPI_BASE}/v2/accounts/${ownerAddress}/jettons/${jettonMasterAddress}`;
  const res = await fetch(url, {
    headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : undefined,
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new TonVerificationError(
      "این کیف‌پول تاکنون تتر (USDT) دریافت نکرده — ابتدا مقدار کمی USDT به آن واریز کنید تا فعال شود."
    );
  }
  if (!res.ok) {
    throw new TonVerificationError(`یافتن کیف‌پول جتون ناموفق بود (${res.status})`);
  }

  const body = (await res.json()) as { wallet_address?: { address?: string } };
  const walletAddress = body?.wallet_address?.address;
  if (!walletAddress) throw new TonVerificationError("آدرس کیف‌پول جتون یافت نشد");

  if (isRedisConfigured) {
    redis.set(cacheKey, walletAddress, { ex: JETTON_WALLET_CACHE_TTL_SECONDS }).catch(() => {});
  }
  return walletAddress;
}

export interface BuildJettonTransferInput {
  jettonAmountUnits: bigint;
  toOwnerAddress: string;
  responseAddress: string;
  comment: string;
}

export function buildJettonTransferPayload(input: BuildJettonTransferInput): string {
  const commentCell = beginCell().storeUint(0, 32).storeStringTail(input.comment).endCell();

  const body = beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(BigInt(Date.now()), 64)
    .storeCoins(input.jettonAmountUnits)
    .storeAddress(Address.parse(input.toOwnerAddress))
    .storeAddress(Address.parse(input.responseAddress))
    .storeBit(false) 
    .storeCoins(JETTON_FORWARD_NANOTON)
    .storeBit(true) 
    .storeRef(commentCell)
    .endCell();

  return body.toBoc().toString("base64");
}
export interface TonApiTransaction {
  hash: string;
  utime: number;
  in_msg?: {
    source?: { address: string };
    op_code?: string;
    decoded_op_name?: string;
    decoded_body?: Record<string, unknown>;
    raw_body?: string;
  };
}

interface TonApiTransactionsResponse {
  transactions: TonApiTransaction[];
}

const TX_FETCH_CACHE_TTL_MS = 4000;
const txFetchCache = new Map<string, { promise: Promise<TonApiTransaction[]>; expiresAt: number }>();

export async function fetchAccountTransactions(address: string): Promise<TonApiTransaction[]> {
  const now = Date.now();
  const cached = txFetchCache.get(address);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const url = `${TONAPI_BASE}/v2/blockchain/accounts/${address}/transactions?limit=50`;
    const res = await fetch(url, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new TonVerificationError(`TonAPI request failed (${res.status})`);
    const body = (await res.json()) as TonApiTransactionsResponse;
    return body.transactions ?? [];
  })();

  txFetchCache.set(address, { promise, expiresAt: now + TX_FETCH_CACHE_TTL_MS });
  promise.catch(() => txFetchCache.delete(address));

  return promise;
}

function extractJettonNotification(tx: TonApiTransaction): { jettonAmountUnits: bigint; comment: string } | null {
  const msg = tx.in_msg;
  if (!msg) return null;

  const isNotification =
    msg.decoded_op_name === "jetton_transfer_notification" ||
    (msg.op_code != null && Number(msg.op_code) === JETTON_TRANSFER_NOTIFICATION_OPCODE);
  if (!isNotification) return null;

  try {
    if (msg.decoded_body) {
      const amountRaw = msg.decoded_body["amount"] ?? msg.decoded_body["jetton_amount"];
      const forwardPayload = msg.decoded_body["forward_payload"] as { value?: { text?: string } } | undefined;
      const comment = forwardPayload?.value?.text ?? "";
      if (amountRaw != null) return { jettonAmountUnits: BigInt(amountRaw as string), comment };
    }

    if (msg.raw_body) {
      const cell = Cell.fromBoc(Buffer.from(msg.raw_body, "base64"))[0];
      const slice = cell.beginParse();
      slice.loadUint(32); // op
      slice.loadUint(64); // query_id
      const amount = slice.loadCoins();
      slice.loadAddress(); // sender
      const hasForward = slice.loadBit();
      let comment = "";
      if (hasForward) {
        const forwardSlice = slice.loadRef().beginParse();
        forwardSlice.loadUint(32);
        comment = forwardSlice.loadStringTail();
      }
      return { jettonAmountUnits: amount, comment };
    }
  } catch {
    return null;
  }
  return null;
}

export function matchIncomingJettonPayment(
  transactions: TonApiTransaction[],
  input: { comment: string; minAmountUnits: bigint; afterUnixTime: number; fromJettonWalletAddress: string }
): { hash: string } | null {
  const match = transactions.find((tx) => {
    if (tx.utime < input.afterUnixTime) return false;

    const source = tx.in_msg?.source?.address;
    if (!source || source !== input.fromJettonWalletAddress) return false;

    const notification = extractJettonNotification(tx);
    if (!notification) return false;
    if (!notification.comment.includes(input.comment)) return false;

    return notification.jettonAmountUnits >= input.minAmountUnits;
  });

  return match ? { hash: match.hash } : null;
}

export async function findIncomingJettonPayment(input: {
  toOwnerAddress: string;
  fromJettonWalletAddress: string;
  comment: string;
  minAmountUnits: bigint;
  afterUnixTime: number;
}): Promise<{ hash: string } | null> {
  const transactions = await fetchAccountTransactions(input.toOwnerAddress);
  return matchIncomingJettonPayment(transactions, input);
}