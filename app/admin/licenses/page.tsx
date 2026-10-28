import { redirect } from "next/navigation";

export default function AdminLicensesRedirectPage() {
  redirect("/admin/publishers?tab=licenses");
}