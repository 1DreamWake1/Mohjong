import { useEffect } from "react";

import { AdminUsersPage } from "../pages/AdminUsersPage.js";
import { GamePage } from "../pages/GamePage.js";
import { HistoryPage } from "../pages/HistoryPage.js";
import { LobbyPage } from "../pages/LobbyPage.js";
import { LoginPage } from "../pages/LoginPage.js";
import { useAuthStore } from "../stores/authStore.js";
import styles from "./App.module.css";
import { APP_ROUTES, getRouteForAuth, replaceRoute } from "./routes.js";
import { useCurrentPath } from "./useCurrentPath.js";

export function App(): JSX.Element {
  const status = useAuthStore((state) => state.status);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const currentPath = useCurrentPath();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const route =
      status === "authenticated" && user
        ? getRouteForAuth({ role: user.role, status: "authenticated" }, currentPath)
        : getRouteForAuth({
            status: status === "checking" ? "checking" : "anonymous"
          });

    if (!route) {
      return;
    }

    replaceRoute(route);
  }, [currentPath, status, user]);

  if (status === "checking") {
    return (
      <main className={styles.shell}>
        <div className={styles.loading}>正在恢复登录状态</div>
      </main>
    );
  }

  if (status === "anonymous" || !token || !user) {
    return <LoginPage />;
  }

  if (user.role === "admin") {
    return <AdminUsersPage token={token} user={user} />;
  }

  if (currentPath === APP_ROUTES.gameDemo) {
    return <GamePage token={token} user={user} />;
  }

  if (currentPath === APP_ROUTES.gameHistory) {
    return <HistoryPage token={token} user={user} />;
  }

  return <LobbyPage token={token} user={user} />;
}
