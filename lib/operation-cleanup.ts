import "server-only";
import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanupOperationData(logDays = 35, approvalDays = 180): Promise<number> {
  const logCutoff = new Date(Date.now() - logDays * DAY_MS);
  const approvalCutoff = new Date(Date.now() - approvalDays * DAY_MS);

  const [logs, approvals] = await Promise.all([
    prisma.operationLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
    prisma.operationApproval.deleteMany({
      where: {
        createdAt: { lt: approvalCutoff },
        OR: [{ status: { in: ["CONSUMED", "REJECTED"] } }, { status: "APPROVED", expiresAt: { lt: new Date() } }],
      },
    }),
  ]);

  return logs.count + approvals.count;
}