"use client";

import Link from "next/link";
import type { StaffRole } from "@prisma/client";
import { DonateButton } from "@/components/team/donate-button";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

export interface StaffCreditItem {
  userId: string;
  firstName: string;
  username: string | null;
  roleTitle: StaffRole;
}

export function ChapterStaffCredits({
  staff,
  isAuthenticated,
}: {
  staff: StaffCreditItem[];
  isAuthenticated: boolean;
}) {
  if (staff.length === 0) return null;

  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-3 px-4">
      <p className="text-center text-sm text-white/60">دست‌اندرکاران این چپتر</p>
      <div className="space-y-2">
        {staff.map((member) => (
          <div
            key={`${member.userId}-${member.roleTitle}`}
            className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
          >
            <Link href={`/app/team/${member.userId}`} className="min-w-0">
              <p className="truncate text-sm text-white">
                {member.username ? `@${member.username}` : member.firstName}
              </p>
              <p className="text-xs text-white/50">{STAFF_ROLE_LABELS[member.roleTitle]}</p>
            </Link>
            <DonateButton receiverId={member.userId} authenticated={isAuthenticated} />
          </div>
        ))}
      </div>
    </div>
  );
}
