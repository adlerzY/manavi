import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminCommentsRedirectPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const params = new URLSearchParams({ tab: "comments" });
  if (status) params.set("status", status);
  redirect(`/admin/moderation?${params.toString()}`);
}