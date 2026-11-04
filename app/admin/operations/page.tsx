import { requireAdmin } from "@/lib/auth";
import { getAdminNavCounts } from "@/lib/admin-counts";
import { listApprovals, listOperationPolicies } from "@/app/admin/actions/operations";
import { listTrash } from "@/app/admin/actions/trash";
import { PageTabs } from "@/components/ui/page-tabs";
import { OperationApprovalQueue } from "@/components/admin/operation-approval-queue";
import { OperationPolicyForm } from "@/components/admin/operation-policy-form";
import { TrashManager } from "@/components/admin/trash-manager";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

async function ApprovalsTab() {
  const rows = await listApprovals("PENDING");
  return <OperationApprovalQueue initialRows={rows} />;
}

async function PoliciesTab() {
  const policies = await listOperationPolicies();
  return <OperationPolicyForm policies={policies} />;
}

async function TrashTab() {
  const items = await listTrash();
  return <TrashManager initialItems={items} />;
}

export default async function AdminOperationsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "policies" || tabParam === "trash" ? tabParam : "approvals";
  const counts = await getAdminNavCounts();

  const tabs = [
    {
      id: "approvals",
      label: `درخواست‌های تأیید${counts.operations > 0 ? ` (${counts.operations.toLocaleString("fa-IR")})` : ""}`,
      href: "/admin/operations",
    },
    { id: "policies", label: "سقف عملیات", href: "/admin/operations?tab=policies" },
    { id: "trash", label: "سطل بازیافت", href: "/admin/operations?tab=trash" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">عملیات حساس و بازیابی</h1>
      <PageTabs tabs={tabs} active={tab} />
      {tab === "policies" ? <PoliciesTab /> : tab === "trash" ? <TrashTab /> : <ApprovalsTab />}
    </div>
  );
}