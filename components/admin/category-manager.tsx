"use client";

import { useState, useTransition } from "react";
import type { ReadingMode, ReadingDirection } from "@prisma/client";
import {
  updateCategory,
  toggleCategoryHomepage,
  toggleCategoryActive,
  deleteCategory,
} from "@/app/admin/actions/category-actions";
import { READING_MODE_LABELS } from "@/lib/reading";
import { CategoryImageUploader } from "@/components/admin/banner-uploader";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  readingDirection: ReadingDirection;
  defaultReadingMode: ReadingMode;
  showOnHomepage: boolean;
  isActive: boolean;
  sortOrder: number;
  comicCount: number;
}

const READING_MODES: ReadingMode[] = ["VERTICAL", "HORIZONTAL"];

export function CategoryManager({ initialCategories }: { initialCategories: CategoryRow[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function startEdit(category: CategoryRow) {
    setEditingId(category.id);
    setEditForm({ ...category });
  }

  function handleSaveEdit() {
    if (!editForm) return;
    setPendingId(editForm.id);
    setError(null);
    startTransition(async () => {
      const result = await updateCategory(editForm.id, {
        name: editForm.name,
        slug: editForm.slug,
        imageUrl: editForm.imageUrl ?? undefined,
        readingDirection: editForm.readingDirection,
        defaultReadingMode: editForm.defaultReadingMode,
        showOnHomepage: editForm.showOnHomepage,
        isActive: editForm.isActive,
        sortOrder: editForm.sortOrder,
      });
      if (result.success) {
        setCategories((prev) => prev.map((c) => (c.id === editForm.id ? { ...editForm } : c)));
        setEditingId(null);
      } else {
        setError(result.error ?? "خطا در ذخیره‌سازی");
      }
      setPendingId(null);
    });
  }

  function handleToggleHomepage(category: CategoryRow) {
    setPendingId(category.id);
    startTransition(async () => {
      const result = await toggleCategoryHomepage(category.id, !category.showOnHomepage);
      if (result.success) {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, showOnHomepage: !c.showOnHomepage } : c)));
      } else {
        setError(result.error ?? "خطا");
      }
      setPendingId(null);
    });
  }

  function handleToggleActive(category: CategoryRow) {
    setPendingId(category.id);
    startTransition(async () => {
      const result = await toggleCategoryActive(category.id, !category.isActive);
      if (result.success) {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, isActive: !c.isActive } : c)));
      } else {
        setError(result.error ?? "خطا");
      }
      setPendingId(null);
    });
  }

  function handleDelete(category: CategoryRow) {
    if (!confirm(`دسته‌بندی «${category.name}» حذف بشه؟`)) return;
    setPendingId(category.id);
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (result.success) {
        setCategories((prev) => prev.filter((c) => c.id !== category.id));
      } else {
        setError(result.error ?? "خطا در حذف");
      }
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-medium text-text-main">لیست دسته‌بندی‌ها</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="divide-y divide-border rounded-md border border-border">
        {categories.map((category) => (
          <div key={category.id} className="space-y-3 px-4 py-3">
            {editingId === category.id && editForm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="نام" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main" />
                  <input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })} placeholder="اسلاگ" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main" />
                  <input type="number" value={editForm.sortOrder} onChange={(e) => setEditForm({ ...editForm, sortOrder: Number(e.target.value) || 0 })} placeholder="ترتیب" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main" />
                </div>
                <CategoryImageUploader
                  entityId={category.id}
                  currentUrl={editForm.imageUrl ?? ""}
                  onUploaded={(url) => setEditForm({ ...editForm, imageUrl: url })}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <select value={editForm.readingDirection} onChange={(e) => setEditForm({ ...editForm, readingDirection: e.target.value as ReadingDirection })} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main">
                    <option value="LTR">LTR</option>
                    <option value="RTL">RTL</option>
                  </select>
                  <select value={editForm.defaultReadingMode} onChange={(e) => setEditForm({ ...editForm, defaultReadingMode: e.target.value as ReadingMode })} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main">
                    {READING_MODES.map((mode) => (
                      <option key={mode} value={mode}>{READING_MODE_LABELS[mode]}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" checked={editForm.showOnHomepage} onChange={(e) => setEditForm({ ...editForm, showOnHomepage: e.target.checked })} />
                    نمایش در هوم
                  </label>
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
                    فعال
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} disabled={pendingId === category.id} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">ذخیره</button>
                  <button onClick={() => setEditingId(null)} className="rounded-md border border-border px-3 py-1 text-xs text-text-muted">انصراف</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm text-text-main">
                    {category.name}
                    <span className="text-xs text-text-muted">/{category.slug}</span>
                    {!category.isActive && <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-text-muted">غیرفعال</span>}
                    {category.showOnHomepage && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">در هوم‌پیج</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {category.comicCount.toLocaleString("fa-IR")} عنوان · جهت: {category.readingDirection} · حالت پیش‌فرض: {READING_MODE_LABELS[category.defaultReadingMode]} · ترتیب {category.sortOrder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleHomepage(category)} disabled={isPending && pendingId === category.id} className="rounded-md border border-border px-2 py-1 text-xs text-text-main disabled:opacity-50">
                    {category.showOnHomepage ? "حذف از هوم‌پیج" : "افزودن به هوم‌پیج"}
                  </button>
                  <button onClick={() => handleToggleActive(category)} disabled={isPending && pendingId === category.id} className="rounded-md border border-border px-2 py-1 text-xs text-text-main disabled:opacity-50">
                    {category.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                  </button>
                  <button onClick={() => startEdit(category)} className="rounded-md border border-border px-2 py-1 text-xs text-text-main">ویرایش</button>
                  <button onClick={() => handleDelete(category)} disabled={isPending && pendingId === category.id} className="rounded-md border border-red-400 px-2 py-1 text-xs text-red-400 disabled:opacity-50">حذف</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز دسته‌بندی‌ای ثبت نشده.</p>}
      </div>
    </div>
  );
}