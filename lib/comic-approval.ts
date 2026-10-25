import "server-only";
import { prisma } from "./prisma";

export async function resolveComicApprovalStatus(
  creatorId: string,
  publisherId: string
): Promise<"APPROVED" | "PENDING_APPROVAL"> {
  const user = await prisma.user.findUnique({ where: { id: creatorId }, select: { role: true } });
  if (user?.role === "ADMIN") return "APPROVED";

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { isVerified: true, contractUserId: true },
  });
  if (!publisher) return "PENDING_APPROVAL";

  if (publisher.contractUserId === creatorId) {
    return publisher.isVerified ? "APPROVED" : "PENDING_APPROVAL";
  }

  const verifiedStaff = await prisma.publisherStaff.findFirst({
    where: { userId: creatorId, publisherId, isVerified: true },
    select: { id: true },
  });
  if (verifiedStaff) return "APPROVED";

  const anyStaff = await prisma.publisherStaff.findFirst({
    where: { userId: creatorId, publisherId },
    select: { id: true },
  });
  return anyStaff && publisher.isVerified ? "APPROVED" : "PENDING_APPROVAL";
}