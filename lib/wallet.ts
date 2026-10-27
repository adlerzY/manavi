import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { UNITS_PER_COIN } from "./units";

export const WALLET_PAGE_SIZE = 20;

export interface WalletEntry {
  id: string;
  title: string;
  detail: string | null;
  coins: number;
  createdAt: string;
}

export interface WalletOverview {
  entries: WalletEntry[];
  total: number;
  earned: number;
  spent: number;
}

const SOURCE_TITLES: Record<string, string> = {
  COIN_PURCHASE: "خرید سکه",
  COIN_BONUS: "سکه هدیه پکیج",
  REFERRAL_REWARD: "پاداش دعوت دوستان",
  SALE: "باز کردن چپتر",
  ADMIN_GRANT: "اعطای سکه توسط پشتیبانی",
  ADMIN_REVOKE: "کسر سکه توسط پشتیبانی",
  OPENING_BALANCE: "موجودی اولیه",
};

export async function getWallet(userId: string, page: number): Promise<WalletOverview> {
  const where: Prisma.LedgerEntryWhereInput = {
    account: "USER_COIN_WALLET",
    ownerType: "USER",
    ownerId: userId,
  };

  const [rows, total, sums] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * WALLET_PAGE_SIZE,
      take: WALLET_PAGE_SIZE,
      select: {
        id: true,
        direction: true,
        amountUnits: true,
        sourceType: true,
        sourceId: true,
        note: true,
        createdAt: true,
      },
    }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.groupBy({ by: ["direction"], where, _sum: { amountUnits: true } }),
  ]);

  let earned = 0;
  let spent = 0;
  for (const row of sums) {
    const coins = Number(row._sum.amountUnits ?? 0) / UNITS_PER_COIN;
    if (row.direction === "CREDIT") earned += coins;
    else spent += coins;
  }

  const saleIds = rows.filter((row) => row.sourceType === "SALE").map((row) => row.sourceId);
  const transactionIds = rows
    .filter((row) => row.sourceType === "COIN_PURCHASE" || row.sourceType === "COIN_BONUS")
    .map((row) => row.sourceId);

  const [sales, transactions] = await Promise.all([
    saleIds.length > 0
      ? prisma.sale.findMany({
          where: { id: { in: saleIds } },
          select: {
            id: true,
            kind: true,
            edition: { select: { work: { select: { title: true } } } },
            _count: { select: { lines: true } },
          },
        })
      : Promise.resolve([]),
    transactionIds.length > 0
      ? prisma.transaction.findMany({
          where: { id: { in: transactionIds } },
          select: { id: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  const entries: WalletEntry[] = rows.map((row) => {
    const units = Number(row.amountUnits) / UNITS_PER_COIN;
    const coins = row.direction === "CREDIT" ? units : -units;
    let title = SOURCE_TITLES[row.sourceType] ?? (row.direction === "CREDIT" ? "افزایش موجودی" : "کاهش موجودی");
    let detail: string | null = null;

    if (row.sourceType === "SALE") {
      const sale = saleById.get(row.sourceId);
      if (sale) {
        detail = sale.edition.work.title;
        if (sale.kind === "BULK") {
          title = "خرید گروهی چپترها";
          detail = `${detail} · ${sale._count.lines.toLocaleString("fa-IR")} چپتر`;
        }
      }
    } else if (row.sourceType === "COIN_PURCHASE") {
      const transaction = transactionById.get(row.sourceId);
      if (transaction) detail = `پرداخت ${Number(transaction.amount).toLocaleString("fa-IR", { maximumFractionDigits: 6 })} USDT`;
    } else if (row.sourceType === "ADMIN_GRANT" || row.sourceType === "ADMIN_REVOKE") {
      detail = row.note;
    }

    return { id: row.id, title, detail, coins, createdAt: row.createdAt.toISOString() };
  });

  return { entries, total, earned, spent };
}