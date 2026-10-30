import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <EmptyState
          pose="sad"
          title="این صفحه پیدا نشد"
          description="شاید لینک قدیمی شده یا اثر برداشته شده. از یکی از مسیرهای زیر ادامه بده."
          actions={[
            { href: "/app", label: "بازگشت به خانه" },
            { href: "/app/explore", label: "جستجوی آثار", variant: "ghost" },
          ]}
        />
      </div>
    </main>
  );
}