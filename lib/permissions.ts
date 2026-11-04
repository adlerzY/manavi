import type { PublisherStaff } from "@prisma/client";

export type StaffPermission =
  | "view"
  | "upload"
  | "publish"
  | "edit"
  | "delete"
  | "manageEditions"
  | "manageComics"
  | "manageMembers"
  | "sensitive";

export type PermissionSet = Record<StaffPermission, boolean>;

export const PERMISSION_KEYS: StaffPermission[] = [
  "view",
  "upload",
  "publish",
  "edit",
  "delete",
  "manageEditions",
  "manageComics",
  "manageMembers",
  "sensitive",
];

export const PERMISSION_LABELS: Record<StaffPermission, string> = {
  view: "مشاهده",
  upload: "آپلود چپتر",
  publish: "انتشار و زمان‌بندی",
  edit: "ویرایش چپتر و صفحات",
  delete: "حذف چپتر و صفحات",
  manageEditions: "مدیریت نسخه‌ها",
  manageComics: "مدیریت اطلاعات اثر",
  manageMembers: "مدیریت اعضای تیم",
  sensitive: "عملیات حساس",
};

export const BASE_PERMISSIONS: PermissionSet = {
  view: true,
  upload: false,
  publish: false,
  edit: false,
  delete: false,
  manageEditions: false,
  manageComics: false,
  manageMembers: false,
  sensitive: false,
};

export const FULL_PERMISSIONS: PermissionSet = {
  view: true,
  upload: true,
  publish: true,
  edit: true,
  delete: true,
  manageEditions: true,
  manageComics: true,
  manageMembers: true,
  sensitive: true,
};

type StaffFlags = Pick<
  PublisherStaff,
  "canUpload" | "canPublish" | "canEdit" | "canDelete" | "canManageEditions" | "canManageComics" | "canManageMembers" | "canSensitive"
>;

export function staffPermissions(row: StaffFlags): PermissionSet {
  return {
    view: true,
    upload: row.canUpload,
    publish: row.canPublish,
    edit: row.canEdit,
    delete: row.canDelete,
    manageEditions: row.canManageEditions,
    manageComics: row.canManageComics,
    manageMembers: row.canManageMembers,
    sensitive: row.canSensitive,
  };
}

export function mergePermissions(a: PermissionSet, b: PermissionSet): PermissionSet {
  const merged = { ...a };
  for (const key of PERMISSION_KEYS) merged[key] = a[key] || b[key];
  return merged;
}