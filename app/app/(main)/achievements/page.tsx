import { getSessionUser } from "@/lib/auth";
import { getAchievementsOverview } from "@/lib/achievement-engine";
import { AchievementGrid } from "@/components/achievements/achievement-grid";
import { BackButton } from "@/components/navigation/back-button";

export default async function AchievementsPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده دستاوردها، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const overview = await getAchievementsOverview(user.id);
  const earned = overview.items.filter((item) => item.earned).length;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app/profile" variant="plain" />
          <div>
            <h1 className="text-lg font-semibold text-text-main">دستاوردها و تگ‌ها</h1>
            <p className="mt-0.5 text-xs text-text-muted">
              {earned.toLocaleString("fa-IR")} از {overview.items.length.toLocaleString("fa-IR")} دستاورد باز شده است
            </p>
          </div>
        </div>
        <AchievementGrid items={overview.items} initialActiveTitle={overview.activeTitle} />
      </div>
    </main>
  );
}