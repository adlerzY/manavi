import "server-only";
import { prisma } from "./prisma";

const DEFAULT_FAILED_TRANSACTION_RETENTION_DAYS = Number(process.env.FAILED_TRANSACTION_RETENTION_DAYS ?? 30);

export async function cleanupOldFailedTransactions(days: number = DEFAULT_FAILED_TRANSACTION_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.transaction.deleteMany({
    where: { status: "FAILED", createdAt: { lt: cutoff } },
  });
  return result.count;
}