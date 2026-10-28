import { getSessionUser } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { CoinBalanceHeader } from "./coin-balance-header";

export async function UserHeaderSection() {
  const user = await getSessionUser();
  const unreadNotifications = user ? await getUnreadNotificationCount(user.id) : 0;

  return (
    <CoinBalanceHeader
      coinsBalance={user?.coinsBalance ?? 0}
      authenticated={Boolean(user)}
      unreadNotifications={unreadNotifications}
    />
  );
}