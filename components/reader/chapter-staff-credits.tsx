"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
    <details className="group mx-auto mt-3 max-w-2xl px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white/70 [&::-webkit-details-marker]:hidden">
        <span>دست‌اندرکاران و حمایت ({staff.length.toLocaleString("fa-IR")})</span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2">
        {staff.map((member) => (
          <div
            key={`${member.userId}-${member.roleTitle}`}
            className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2"
          >
            <Link href={`/app/team/${member.userId}`} className="min-w-0">
              <p className="truncate text-sm text-white">{member.username ? `@${member.username}` : member.firstName}</p>
              <p className="text-xs text-white/50">{STAFF_ROLE_LABELS[member.roleTitle]}</p>
            </Link>
            <DonateButton
              receiverId={member.userId}
              authenticated={isAuthenticated}
              receiverName={member.username ? `@${member.username}` : member.firstName}
              size="small"
            />
          </div>
        ))}
      </div>
    </details>
  );
}