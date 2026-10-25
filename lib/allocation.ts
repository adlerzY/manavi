import type { BeneficiaryType, StaffRole } from "@prisma/client";
import { BPS_DENOMINATOR, mulBps } from "./units";

export interface AllocationStaff {
  userId: string;
  role: StaffRole;
  shareBps: number;
}

export interface AllocationInput {
  baseUnits: number;
  publisherBps: number;
  publisherId: string;
  staff: AllocationStaff[];
}

export interface AllocationLine {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string | null;
  role: StaffRole | null;
  memberShareBps: number | null;
  allocatedUnits: number;
}

export function allocateRevenue(input: AllocationInput): AllocationLine[] {
  const publisherBps = Math.min(BPS_DENOMINATOR, Math.max(0, input.publisherBps));
  const publisherTotal = mulBps(input.baseUnits, publisherBps);
  const platformUnits = input.baseUnits - publisherTotal;
  const lines: AllocationLine[] = [];

  if (platformUnits > 0) {
    lines.push({ beneficiaryType: "PLATFORM", beneficiaryId: null, role: null, memberShareBps: null, allocatedUnits: platformUnits });
  }

  let remaining = publisherTotal;
  for (const member of input.staff) {
    if (member.shareBps <= 0) continue;
    const units = Math.min(remaining, mulBps(publisherTotal, Math.min(member.shareBps, BPS_DENOMINATOR)));
    if (units <= 0) continue;
    remaining -= units;
    lines.push({ beneficiaryType: "USER", beneficiaryId: member.userId, role: member.role, memberShareBps: member.shareBps, allocatedUnits: units });
  }

  if (remaining > 0) {
    lines.push({ beneficiaryType: "PUBLISHER", beneficiaryId: input.publisherId, role: null, memberShareBps: null, allocatedUnits: remaining });
  }

  return lines;
}