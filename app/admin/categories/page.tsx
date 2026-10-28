import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PageTabs } from "@/components/ui/page-tabs";
import { CreateCategoryForm } from "@/components/admin/create-category-form";
import { CategoryManager, type CategoryRow } from "@/components/admin/category-manager";
import { CreateGenreForm } from "@/components/admin/create-genre-form";
import { GenreManager } from "@/components/admin/genre-manager";

const TABS = [
  { id: "categories", label: "دسته‌بندی اصلی", href: "/admin/categories" },
  { id: "genres", label: "ژانرها", href: "/admin/categories?tab=genres" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

async function CategoriesTab() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      readingDirection: true,
      defaultReadingMode: true,
      showOnHomepage: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { comics: true } },
    },
  });

  const rows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    imageUrl: c.imageUrl,
    readingDirection: c.readingDirection,
    defaultReadingMode: c.defaultReadingMode,
    showOnHomepage: c.showOnHomepage,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    comicCount: c._count.comics,
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        این دسته‌بندی‌ها (مانهوا، مانگا، کمیک، وبتون و...) پایه فیلتر «نوع اثر» در صفحه جستجو و ردیف‌های صفحه اصلی هستند.
      </p>
      <CollapsibleSection triggerLabel="افزودن دسته‌بندی جدید">
        <CreateCategoryForm />
      </CollapsibleSection>
      <CategoryManager initialCategories={rows} />
    </div>
  );
}

async function GenresTab() {
  const genres = await prisma.genre.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      _count: { select: { comics: true } },
    },
  });

  const rows = genres.map((g) => ({
    id: g.id,
    name: g.name,
    imageUrl: g.imageUrl,
    comicCount: g._count.comics,
  }));

  return (
    <div className="space-y-4">
      <CreateGenreForm />
      <GenreManager genres={rows} />
    </div>
  );
}

export default async function AdminCategoriesPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "genres" ? "genres" : "categories";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">دسته‌بندی‌ها</h1>
      <PageTabs tabs={TABS} active={tab} />
      {tab === "genres" ? <GenresTab /> : <CategoriesTab />}
    </div>
  );
}