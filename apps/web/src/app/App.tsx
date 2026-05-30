import type { AuthUser, UserSummary } from "@mahjong/shared";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  createPlayer,
  deletePlayer,
  getCurrentUser,
  listPlayers,
  login
} from "../api/client.js";
import styles from "./App.module.css";

const TOKEN_STORAGE_KEY = "mahjong.authToken";

type AuthState =
  | { status: "checking" }
  | { status: "anonymous" }
  | { status: "authenticated"; token: string; user: AuthUser };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function App(): JSX.Element {
  const [authState, setAuthState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setAuthState({ status: "anonymous" });
      return;
    }

    void getCurrentUser(token)
      .then((user) => {
        setAuthState({ status: "authenticated", token, user });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthState({ status: "anonymous" });
      });
  }, []);

  function handleLoggedIn(token: string, user: AuthUser): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAuthState({ status: "authenticated", token, user });
  }

  function handleLogout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthState({ status: "anonymous" });
  }

  if (authState.status === "checking") {
    return (
      <main className={styles.shell}>
        <div className={styles.loading}>正在恢复登录状态</div>
      </main>
    );
  }

  if (authState.status === "anonymous") {
    return <LoginPage onLoggedIn={handleLoggedIn} />;
  }

  if (authState.user.role !== "admin") {
    return (
      <main className={styles.shell}>
        <section className={styles.noticePanel}>
          <p className={styles.kicker}>在线麻将</p>
          <h1>玩家入口</h1>
          <p>
            {authState.user.username} 已登录。玩家大厅和牌桌会在后续阶段接入。
          </p>
          <dl className={styles.accountSummary}>
            <div>
              <dt>账号身份</dt>
              <dd>玩家</dd>
            </div>
            <div>
              <dt>账号创建时间</dt>
              <dd>{new Date(authState.user.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          <div>
            <button className={styles.secondaryButton} onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AdminUsersPage
      token={authState.token}
      user={authState.user}
      onLogout={handleLogout}
      onAuthExpired={handleLogout}
    />
  );
}

function LoginPage(props: {
  onLoggedIn: (token: string, user: AuthUser) => void;
}): JSX.Element {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await login({ username, password });
      props.onLoggedIn(response.token, response.user);
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.loginLayout}>
        <div className={styles.loginCopy}>
          <p className={styles.kicker}>在线麻将</p>
          <h1>账号管理后台</h1>
          <p>管理员登录后可以创建和维护玩家账号。</p>
        </div>
        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "登录中" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminUsersPage(props: {
  onAuthExpired: () => void;
  onLogout: () => void;
  token: string;
  user: AuthUser;
}): JSX.Element {
  const [players, setPlayers] = useState<UserSummary[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const playerCountText = useMemo(
    () => `${players.length} 个玩家账号`,
    [players.length]
  );

  async function refreshPlayers(): Promise<void> {
    setError(null);
    setIsLoading(true);

    try {
      setPlayers(await listPlayers(props.token));
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        props.onAuthExpired();
        return;
      }

      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPlayers();
  }, []);

  async function handleCreatePlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsCreating(true);

    try {
      const player = await createPlayer(props.token, { username, password });
      setPlayers((currentPlayers) => [player, ...currentPlayers]);
      setUsername("");
      setPassword("");
      setNotice(`已创建玩家 ${player.username}`);
    } catch (createError) {
      if (isUnauthorizedError(createError)) {
        props.onAuthExpired();
        return;
      }

      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeletePlayer(player: UserSummary): Promise<void> {
    if (!window.confirm(`确认删除玩家 ${player.username}？`)) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await deletePlayer(props.token, player.id);
      setPlayers((currentPlayers) =>
        currentPlayers.filter((item) => item.id !== player.id)
      );
      setNotice(`已删除玩家 ${player.username}`);
    } catch (deleteError) {
      if (isUnauthorizedError(deleteError)) {
        props.onAuthExpired();
        return;
      }

      setError(getErrorMessage(deleteError));
    }
  }

  return (
    <main className={styles.adminShell}>
      <header className={styles.adminHeader}>
        <div>
          <p className={styles.kicker}>在线麻将</p>
          <h1>玩家账号管理</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.roleBadge}>管理员</span>
          <span>{props.user.username}</span>
          <button className={styles.secondaryButton} onClick={props.onLogout}>
            退出
          </button>
        </div>
      </header>

      <section className={styles.adminGrid}>
        <form className={styles.formPanel} onSubmit={handleCreatePlayer}>
          <h2>创建玩家</h2>
          <label>
            用户名
            <input
              onChange={(event) => setUsername(event.target.value)}
              pattern="[a-zA-Z0-9_-]{3,32}"
              placeholder="player_001"
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            初始密码
            <input
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className={styles.primaryButton} disabled={isCreating}>
            {isCreating ? "创建中" : "创建账号"}
          </button>
          {notice ? <p className={styles.notice}>{notice}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>

        <section className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>玩家列表</h2>
              <p>{playerCountText}</p>
            </div>
            <button className={styles.secondaryButton} onClick={refreshPlayers}>
              刷新
            </button>
          </div>

          {isLoading ? (
            <p className={styles.emptyState}>正在加载玩家列表</p>
          ) : players.length === 0 ? (
            <p className={styles.emptyState}>还没有玩家账号</p>
          ) : (
            <div className={styles.playerList}>
              {players.map((player) => (
                <article className={styles.playerRow} key={player.id}>
                  <div>
                    <strong>{player.username}</strong>
                    <span>创建于 {new Date(player.createdAt).toLocaleString()}</span>
                  </div>
                  <button
                    className={styles.dangerButton}
                    onClick={() => void handleDeletePlayer(player)}
                  >
                    删除
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
