import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { CreateComicForm } from "@/components/admin/create-comic-form";
import { getAllGenres } from "@/lib/genres";
import { getAllCategories } from "@/lib/categories";
import { ComicStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 30;

interface PageProps {
  searchParams: Promise<{ q?: string; categoryId?: string; status?: string; page?: string }>;
}

export default async function AdminComicsPage({ searchParams }: PageProps) {
  const { q, categoryId, status: statusParam, page: pageParam } = await searchParams;
  const query = q?.trim();
  const page = Math.max(1, Number(pageParam) || 1);
  const status = (
    statusParam === "ONGOING" || statusParam === "COMPLETED" || statusParam === "HIATUS"
      ? statusParam
      : undefined
  ) as ComicStatus | undefined;

  const where: Prisma.ComicWhereInput = {
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
  };

  const [comics, total, licenses, genres, categories] = await Promise.all([
    prisma.comic.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        license: { select: { status: true } },
        category: { select: { name: true } },
        _count: { select: { chapters: true } },
      },
    }),
    prisma.comic.count({ where }),
    prisma.license.findMany({
      where: { status: { notIn: ["EXPIRED", "TERMINATED"] } },
      include: { publisher: { select: { name: true } } },
    }),
    getAllGenres(),
    getAllCategories(),
  ]);

  const comicIds = comics.map((c) => c.id);
  const publishedCounts = comicIds.length
    ? await prisma.chapter.groupBy({
        by: ["comicId"],
        where: { comicId: { in: comicIds }, status: "PUBLISHED" },
        _count: { _all: true },
      })
    : [];
  const publishedByComicId = new Map(publishedCounts.map((p) => [p.comicId, p._count._all]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const licenseOptions = licenses.map((l) => ({ id: l.id, publisherName: l.publisher.name, territory: l.territory, status: l.status }));

  function buildHref(overrides: { q?: string; categoryId?: string; status?: string; page?: number }): string {
    const qp = new URLSearchParams();
    const nextQ = overrides.q !== undefined ? overrides.q : query;
    const nextCategoryId = overrides.categoryId !== undefined ? overrides.categoryId : categoryId;
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextPage = overrides.page ?? 1;

    if (nextQ) qp.set("q", nextQ);
    if (nextCategoryId) qp.set("categoryId", nextCategoryId);
    if (nextStatus) qp.set("status", nextStatus);
    if (nextPage > 1) qp.set("page", String(nextPage));
    const qs = qp.toString();
    return `/admin/comics${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-8">
      <CollapsibleSection triggerLabel="افزودن عنوان جدید">
        <CreateComicForm
          licenses={licenseOptions}
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name, defaultReadingMode: c.defaultReadingMode }))}
        />
      </CollapsibleSection>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-text-main">لیست عناوین</h2>
          <span className="text-xs text-text-muted">{total.toLocaleString("fa-IR")} مورد</span>
        </div>

        <form className="flex flex-wrap gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="جستجوی عنوان یا اسلاگ..."
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary"
          />
          <select name="categoryId" defaultValue={categoryId ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-main">
            <option value="">همه دسته‌بندی‌ها</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={status ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-main">
            <option value="">همه وضعیت‌ها</option>
            <option value="ONGOING">در حال انتشار</option>
            <option value="COMPLETED">پایان‌یافته</option>
            <option value="HIATUS">متوقف‌شده</option>
          </select>
          <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">جستجو</button>
          {(query || categoryId || status) && (
            <Link href="/admin/comics" className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted">
              پاک کردن
            </Link>
          )}
        </form>

        <div className="divide-y divide-border rounded-md border border-border">
          {comics.map((c) => (
            <Link key={c.id} href={`/admin/comics/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface">
              <div>
                <p className="text-sm text-text-main">{c.title}</p>
                <p className="text-xs text-text-muted">اسلاگ: {c.slug} · {c.category.name}</p>
              </div>
              <p className="text-xs text-text-muted">
                {c.license.status} · {(publishedByComicId.get(c.id) ?? 0).toLocaleString("fa-IR")}/{c._count.chapters.toLocaleString("fa-IR")} چپتر منتشرشده
              </p>
            </Link>
          ))}
          {comics.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">موردی یافت نشد.</p>}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-text-muted">
            <Link href={buildHref({ page: page - 1 })} className={`rounded-md border border-border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>قبلی</Link>
            <span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
            <Link href={buildHref({ page: page + 1 })} className={`rounded-md border border-border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>بعدی</Link>
          </div>
        )}
      </div>
    </div>
  );
}