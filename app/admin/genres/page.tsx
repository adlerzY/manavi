import { redirect } from "next/navigation";

export default function AdminGenresRedirectPage() {
  redirect("/admin/categories?tab=genres");
}