import "server-only";
import { prisma } from "./prisma";
import { LicenseStatus, type License } from "@prisma/client";

export const LICENSE_STATUS_LABELS_FA: Record<LicenseStatus, string> = {
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  EXPIRED: "منقضی‌شده",
  TERMINATED: "لغوشده",
};

export type LicenseInactiveReason = "TERMINATED" | "STATUS_NOT_ACTIVE" | "NOT_STARTED" | "EXPIRED";

const LICENSE_INACTIVE_REASON_LABELS_FA: Record<LicenseInactiveReason, string> = {
  TERMINATED: "لایسنس لغو شده است",
  STATUS_NOT_ACTIVE: "لایسنس در وضعیت فعال نیست",
  NOT_STARTED: "تاریخ شروع لایسنس هنوز نرسیده است",
  EXPIRED: "تاریخ پایان لایسنس گذشته است",
};

export class LicenseInactiveError extends Error {
  public reasonFa: string;

  constructor(public reason: LicenseInactiveReason, public licenseId: string) {
    super(`License ${licenseId} is not active: ${reason}`);
    this.name = "LicenseInactiveError";
    this.reasonFa = LICENSE_INACTIVE_REASON_LABELS_FA[reason];
  }
}

export class ComicNotFoundError extends Error {
  constructor(public comicId: string) {
    super(`Comic ${comicId} not found`);
    this.name = "ComicNotFoundError";
  }
}

export async function assertLicenseActive(comicId: string): Promise<License> {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    include: { license: true },
  });

  if (!comic) {
    throw new ComicNotFoundError(comicId);
  }

  const license = comic.license;
  const now = new Date();

  if (license.terminatedAt) {
    throw new LicenseInactiveError("TERMINATED", license.id);
  }
  if (license.status !== LicenseStatus.ACTIVE) {
    throw new LicenseInactiveError("STATUS_NOT_ACTIVE", license.id);
  }
  if (license.startDate > now) {
    throw new LicenseInactiveError("NOT_STARTED", license.id);
  }
  if (license.endDate && license.endDate < now) {
    throw new LicenseInactiveError("EXPIRED", license.id);
  }

  return license;
}

export interface LicenseActivityFields {
  status: LicenseStatus;
  terminatedAt: Date | null;
  startDate: Date;
  endDate: Date | null;
}

export function isLicenseCurrentlyActive(license: LicenseActivityFields): boolean {
  const now = new Date();
  if (license.terminatedAt) return false;
  if (license.status !== LicenseStatus.ACTIVE) return false;
  if (license.startDate > now) return false;
  if (license.endDate && license.endDate < now) return false;
  return true;
}