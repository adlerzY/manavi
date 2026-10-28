import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { listNotifications, NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { BackButton } from "@/components/navigation/back-button";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده اعلان‌ها، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const { items, total } = await listNotifications(user.id, page);
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));

  const listItems = items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    href: item.href,
    read: item.read,
    createdLabel: new Date(item.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }),
  }));

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app" variant="plain" />
          <h1 className="text-lg font-semibold text-text-main">اعلان‌ها</h1>
        </div>

        <NotificationList key={page} initialItems={listItems} />

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-text-muted">
            <Link
              href={`/app/notifications${page - 1 > 1 ? `?page=${page - 1}` : ""}`}
              className={`rounded-md border border-border px-3 py-2 ${
                page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"
              }`}
            >
              قبلی
            </Link>
            <span>
              صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
            </span>
            <Link
              href={`/app/notifications?page=${page + 1}`}
              className={`rounded-md border border-border px-3 py-2 ${
                page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"
              }`}
            >
              بعدی
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}