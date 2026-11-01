import type { LedgerOwnerType, WithdrawalEventType, WithdrawalResponseStatus, WithdrawalStatus } from "@prisma/client";

export const MAX_PAYOUT_CARDS = 3;
export const WITHDRAWAL_PAGE_SIZE = 20;
export const LEDGER_PAGE_SIZE = 25;
export const WITHDRAWAL_RECEIPT_MAX_BYTES = 4_000_000;

export interface WithdrawalEventView {
  id: string;
  type: WithdrawalEventType;
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
}

export interface WithdrawalView {
  id: string;
  code: string;
  ownerType: LedgerOwnerType;
  ownerLabel: string;
  requesterName: string;
  coins: number;
  coinValueToman: number;
  amountToman: number;
  cardHolder: string;
  cardDisplay: string;
  cardRaw: string;
  iban: string | null;
  status: WithdrawalStatus;
  requesterNote: string | null;
  adminNote: string | null;
  processedByName: string | null;
  processedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  hasReceipt: boolean;
  response: WithdrawalResponseStatus | null;
  responseNote: string | null;
  respondedAt: string | null;
  disputeResolvedAt: string | null;
  disputeResolution: string | null;
  createdAt: string;
  events: WithdrawalEventView[];
}

export interface PayoutCardView {
  id: string;
  holderName: string;
  cardMasked: string;
  iban: string | null;
  isDefault: boolean;
}

export interface EarningsAccountView {
  ownerType: "USER" | "PUBLISHER";
  ownerId: string;
  label: string;
  balanceCoins: number;
  heldCoins: number;
  lifetimeEarnedCoins: number;
  lifetimeWithdrawnCoins: number;
  monthEarnedCoins: number;
  openWithdrawalId: string | null;
}

export interface PayoutTermsView {
  coinValueToman: number;
  minCoins: number;
}

export interface EarningsOverviewData {
  accounts: EarningsAccountView[];
  cards: PayoutCardView[];
  terms: PayoutTermsView;
  withdrawals: WithdrawalView[];
}

export interface LedgerRowView {
  id: string;
  title: string;
  detail: string | null;
  coins: number;
  createdAt: string;
}

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  PENDING: "در انتظار بررسی",
  PROCESSING: "در حال پرداخت",
  PAID: "پرداخت‌شده",
  REJECTED: "ردشده",
  CANCELLED: "لغوشده",
};

export const WITHDRAWAL_STATUS_CLASSES: Record<WithdrawalStatus, string> = {
  PENDING: "bg-accent/10 text-accent",
  PROCESSING: "bg-primary/10 text-primary",
  PAID: "bg-primary/10 text-primary",
  REJECTED: "bg-red-500/10 text-red-400",
  CANCELLED: "bg-border text-text-muted",
};

export const WITHDRAWAL_EVENT_LABELS: Record<WithdrawalEventType, string> = {
  CREATED: "ثبت درخواست",
  PROCESSING: "شروع بررسی و پرداخت",
  PAID: "ثبت پرداخت و بارگذاری رسید",
  REJECTED: "رد درخواست",
  CANCELLED: "لغو توسط درخواست‌دهنده",
  CONFIRMED: "تأیید دریافت",
  DISPUTED: "ثبت مغایرت",
  DISPUTE_RESOLVED: "پاسخ مدیریت به مغایرت",
};

export function formatCoins(value: number): string {
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

export function formatToman(value: number): string {
  return `${Math.round(value).toLocaleString("fa-IR")} تومان`;
}