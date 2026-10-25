import type { BeneficiaryType, SettlementLineStatus } from "@prisma/client";

export const LINE_STATUS_LABELS: Record<SettlementLineStatus, string> = {
  CALCULATED: "محاسبه‌شده",
  APPROVED_FOR_PAYMENT: "تأییدشده برای پرداخت",
  PAID_BY_ADMIN: "پرداخت‌شده توسط مدیر",
  CONFIRMED_BY_RECIPIENT: "تأییدشده توسط دریافت‌کننده",
  ON_HOLD: "نگه‌داشته‌شده",
  PARTIALLY_PAID: "پرداخت جزئی",
  DISPUTED: "مغایرت",
  CANCELLED: "لغوشده",
};

export const BENEFICIARY_LABELS: Record<BeneficiaryType, string> = {
  PLATFORM: "پلتفرم",
  PUBLISHER: "ناشر",
  USER: "همکار",
};

export function formatUsdt(value: number): string {
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 6 })} USDT`;
}