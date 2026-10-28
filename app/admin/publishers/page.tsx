import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PageTabs } from "@/components/ui/page-tabs";
import { CreatePublisherForm } from "@/components/admin/create-publisher-form";
import { PublisherOwnerLink } from "@/components/admin/publisher-owner-link";
import { PublisherVerificationPanel } from "@/components/admin/publisher-verification-panel";
import { CreateLicenseForm } from "@/components/admin/create-license-form";
import { LicenseRowActions } from "@/components/admin/license-row-actions";

const PAGE_SIZE = 50;

const TABS = [
  { id: "publishers", label: "ناشران", href: "/admin/publishers" },
  { id: "licenses", label: "لایسنس‌ها", href: "/admin/publishers?tab=licenses" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>;
}

function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-xs text-text-muted">
      <Link
        href={hrefFor(page - 1)}
        className={`rounded-md border border-border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"}`}
      >
        قبلی
      </Link>
      <span>
        صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
      </span>
      <Link
        href={hrefFor(page + 1)}
        className={`rounded-md border border-border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"}`}
      >
        بعدی
      </Link>
    </div>
  );
}

async function PublishersTab({ page }: { page: number }) {
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
  const hrefFor = (nextPage: number) => (nextPage > 1 ? `/admin/publishers?page=${nextPage}` : "/admin/publishers");

  return (
    <div className="space-y-4">
      <CollapsibleSection triggerLabel="افزودن ناشر جدید">
        <CreatePublisherForm />
      </CollapsibleSection>

      <p className="text-xs text-text-muted">{total.toLocaleString("fa-IR")} ناشر</p>

      <div className="divide-y divide-border rounded-md border border-border">
        {publishers.map((p) => (
          <div key={p.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-main">{p.name}</p>
                <p className="text-xs text-text-muted">{p.contactEmail}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-text-muted">{p.licenses.length.toLocaleString("fa-IR")} لایسنس</span>
                <PublisherOwnerLink publisherId={p.id} ownerUsername={p.contractUser?.username ?? null} />
              </div>
            </div>
            <PublisherVerificationPanel publisherId={p.id} initialIsVerified={p.isVerified} />
          </div>
        ))}
        {publishers.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز ناشری ثبت نشده است.</p>}
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  );
}

async function LicensesTab({ page, query }: { page: number; query?: string }) {
  const where = query
    ? {
        OR: [
          { publisher: { name: { contains: query, mode: "insensitive" as const } } },
          { territory: { has: query.toUpperCase() } },
          { contractReference: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [licenses, total, publishers] = await Promise.all([
    prisma.license.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { publisher: { select: { name: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.license.count({ where }),
    prisma.publisher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(nextPage: number): string {
    const qp = new URLSearchParams({ tab: "licenses" });
    if (query) qp.set("q", query);
    if (nextPage > 1) qp.set("page", String(nextPage));
    return `/admin/publishers?${qp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <CollapsibleSection triggerLabel="افزودن لایسنس جدید">
        <CreateLicenseForm publishers={publishers} />
      </CollapsibleSection>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-1 gap-2">
          <input type="hidden" name="tab" value="licenses" />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="جستجوی نام ناشر، قلمرو یا شماره قرارداد..."
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary"
          />
          <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">جستجو</button>
        </form>
        <span className="text-xs text-text-muted">{total.toLocaleString("fa-IR")} مورد</span>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {licenses.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-text-main">
                {l.publisher.name} — {l.territory.join("/")}
              </p>
              <p className="text-xs text-text-muted">
                {l.status} · شروع: {l.startDate.toLocaleDateString("fa-IR")}
                {l.endDate ? ` · پایان: ${l.endDate.toLocaleDateString("fa-IR")}` : ""}
                {l.contractReference ? ` · قرارداد: ${l.contractReference}` : ""}
              </p>
            </div>
            <LicenseRowActions licenseId={l.id} status={l.status} />
          </div>
        ))}
        {licenses.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">موردی یافت نشد.</p>}
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  );
}

export default async function AdminPublishersPage({ searchParams }: PageProps) {
  const { tab: tabParam, page: pageParam, q } = await searchParams;
  const tab = tabParam === "licenses" ? "licenses" : "publishers";
  const page = Math.max(1, Number(pageParam) || 1);
  const query = q?.trim();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">ناشران و لایسنس‌ها</h1>
      <PageTabs tabs={TABS} active={tab} />
      {tab === "licenses" ? <LicensesTab page={page} query={query} /> : <PublishersTab page={page} />}
    </div>
  );
}