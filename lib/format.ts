export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" });
}