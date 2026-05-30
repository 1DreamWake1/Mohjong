import { useEffect } from "react";

import { AdminUsersPage } from "../pages/AdminUsersPage.js";
import { LobbyPage } from "../pages/LobbyPage.js";
import { LoginPage } from "../pages/LoginPage.js";
import { useAuthStore } from "../stores/authStore.js";
import styles from "./App.module.css";
import { getRouteForAuth, replaceRoute } from "./routes.js";

export function App(): JSX.Element {
  const status = useAuthStore((state) => state.status);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const route =
      status === "authenticated" && user
        ? getRouteForAuth({ role: user.role, status: "authenticated" })
        : getRouteForAuth({
            status: status === "checking" ? "checking" : "anonymous"
          });

    if (!route) {
      return;
    }

    replaceRoute(route);
  }, [status, user]);

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

  return <LobbyPage token={token} user={user} />;
}
