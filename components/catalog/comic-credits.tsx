import Link from "next/link";
import type { StaffRole } from "@prisma/client";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

interface CreditsPublisher {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface CreditsStaffMember {
  userId: string;
  name: string;
  role: StaffRole;
}

interface ComicCreditsProps {
  publisher: CreditsPublisher | null;
  staff: CreditsStaffMember[];
}

interface GroupedMember {
  userId: string;
  name: string;
  roles: StaffRole[];
}

const VISIBLE_STAFF = 3;

function MemberLink({ member }: { member: GroupedMember }) {
  return (
    <Link href={`/app/team/${member.userId}`} className="inline-flex items-baseline gap-1">
      <span className="text-text-main">{member.name}</span>
      <span className="text-[11px] text-text-muted">{member.roles.map((role) => STAFF_ROLE_LABELS[role]).join("، ")}</span>
    </Link>
  );
}

export function ComicCredits({ publisher, staff }: ComicCreditsProps) {
  const grouped = new Map<string, GroupedMember>();
  for (const member of staff) {
    const existing = grouped.get(member.userId);
    if (existing) {
      if (!existing.roles.includes(member.role)) existing.roles.push(member.role);
    } else {
      grouped.set(member.userId, { userId: member.userId, name: member.name, roles: [member.role] });
    }
  }

  const members = [...grouped.values()];
  if (!publisher && members.length === 0) return null;

  const visible = members.slice(0, VISIBLE_STAFF);
  const hidden = members.slice(VISIBLE_STAFF);

  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {publisher && (
          <Link href={`/app/publisher/${publisher.id}`} className="inline-flex items-center gap-1.5">
            <SafeAvatar src={publisher.avatarUrl} fallbackText={publisher.name} size={22} />
            <span className="text-text-main">{publisher.name}</span>
            <span className="text-[11px] text-text-muted">ناشر</span>
          </Link>
        )}
        {visible.map((member) => (
          <MemberLink key={member.userId} member={member} />
        ))}
      </div>

      {hidden.length > 0 && (
        <details>
          <summary className="cursor-pointer text-primary">و {hidden.length.toLocaleString("fa-IR")} نفر دیگر</summary>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {hidden.map((member) => (
              <MemberLink key={member.userId} member={member} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}