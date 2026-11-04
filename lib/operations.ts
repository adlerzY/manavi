export const OPERATION_DEFAULTS: Record<string, { label: string; maxUnits: number; windowHours: number }> = {
  "chapter.delete": { label: "حذف چپتر", maxUnits: 10, windowHours: 24 },
  "chapter.pageRemove": { label: "حذف صفحه چپتر", maxUnits: 40, windowHours: 24 },
  "comic.delete": { label: "حذف عنوان", maxUnits: 2, windowHours: 24 },
  "edition.delete": { label: "حذف نسخه", maxUnits: 3, windowHours: 24 },
};

export const APPROVAL_VALID_HOURS = 6;

export function operationLabel(operation: string): string {
  return OPERATION_DEFAULTS[operation]?.label ?? operation;
}