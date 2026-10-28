import { redirect } from "next/navigation";

export default function AdminCoinPackagesRedirectPage() {
  redirect("/admin/settings?tab=coins");
}