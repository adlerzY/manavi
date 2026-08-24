import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { CreatePublisherForm } from "@/components/admin/create-publisher-form";
import { PublisherOwnerLink } from "@/components/admin/publisher-owner-link";
import { PublisherVerificationPanel } from "@/components/admin/publisher-verification-panel";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminPublishersPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [publishers, total] = await Promise.all([
    prisma.publisher.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        isVerified: true,
        licenses: { select: { id: true } },
        contractUser: { select: { username: true } },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.publisher.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <CollapsibleSection triggerLabel="افزودن ناشر جدید">
        <CreatePublisherForm />
      </CollapsibleSection>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-main">لیست ناشران</h2>
          <span className="text-xs text-text-muted">{total.toLocaleString("fa-IR")} مورد</span>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {publishers.map((p) => (
            <div key={p.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-text-main">{p.name}</p>
                  <p className="text-xs text-text-muted">{p.contactEmail}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-muted">{p.licenses.length} لایسنس</span>
                  <PublisherOwnerLink publisherId={p.id} ownerUsername={p.contractUser?.username ?? null} />
                </div>
              </div>
              <PublisherVerificationPanel publisherId={p.id} initialIsVerified={p.isVerified} />
            </div>
          ))}
          {publishers.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز ناشری ثبت نشده است.</p>}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-text-muted">
            <Link
              href={`/admin/publishers?page=${page - 1}`}
              className={`rounded-md border border-border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"}`}
            >
              قبلی
            </Link>
            <span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
            <Link
              href={`/admin/publishers?page=${page + 1}`}
              className={`rounded-md border border-border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"}`}
            >
              بعدی
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}