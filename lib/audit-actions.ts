export const AUDIT_GROUPS: { value: string; label: string }[] = [
  { value: "comic", label: "عناوین" },
  { value: "chapter", label: "چپترها" },
  { value: "genre", label: "ژانرها" },
  { value: "publisher", label: "ناشران" },
  { value: "staff", label: "تایید اعضای تیم" },
  { value: "license", label: "لایسنس‌ها" },
  { value: "user", label: "کاربران و سکه" },
  { value: "platformSettings", label: "تنظیمات سراسری" },
  { value: "publisherStaff", label: "تیم ناشر" },
  { value: "comicStaff", label: "دست‌اندرکاران اثر" },
  { value: "settlement", label: "تسویه‌حساب" },
];

export function auditGroupLabel(action: string): string | null {
  const group = action.split(".")[0];
  return AUDIT_GROUPS.find((item) => item.value === group)?.label ?? null;
}