import { redirect } from "next/navigation";

export default function AdminChapterApprovalsRedirectPage() {
  redirect("/admin/moderation");
}