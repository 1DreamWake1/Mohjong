import type { AuthUser, UserSummary } from "@mahjong/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  createPlayer,
  deletePlayer,
  listPlayers,
  resetPlayerPassword
} from "../api/client.js";
import { getErrorMessage, isUnauthorizedError } from "../api/errors.js";
import styles from "../app/App.module.css";
import { useAuthStore } from "../stores/authStore.js";
import { formatDateTime } from "../utils/date.js";

type AdminUsersPageProps = {
  token: string;
  user: AuthUser;
};

export function AdminUsersPage(props: AdminUsersPageProps): JSX.Element {
  const clearSession = useAuthStore((state) => state.clearSession);
  const signOut = useAuthStore((state) => state.signOut);
  const [players, setPlayers] = useState<UserSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<number>>(
    () => new Set()
  );
  const [resettingPlayerIds, setResettingPlayerIds] = useState<Set<number>>(
    () => new Set()
  );
  const filteredPlayers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const sortedPlayers = [...players].sort((leftPlayer, rightPlayer) =>
      leftPlayer.username.localeCompare(rightPlayer.username)
    );

    if (!normalizedQuery) {
      return sortedPlayers;
    }

    return sortedPlayers.filter((player) =>
      player.username.toLowerCase().includes(normalizedQuery)
    );
  }, [players, searchQuery]);
  const playerCountText = searchQuery.trim()
    ? `${filteredPlayers.length} / ${players.length} 个玩家账号`
    : `${players.length} 个玩家账号`;

  async function refreshPlayers(): Promise<void> {
    setError(null);
    setIsLoading(true);

    try {
      setPlayers(await listPlayers(props.token));
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        clearSession();
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

  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
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
        clearSession();
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
    setDeletingPlayerIds((currentIds) => new Set(currentIds).add(player.id));

    try {
      await deletePlayer(props.token, player.id);
      setPlayers((currentPlayers) =>
        currentPlayers.filter((item) => item.id !== player.id)
      );
      setNotice(`已删除玩家 ${player.username}`);
    } catch (deleteError) {
      if (isUnauthorizedError(deleteError)) {
        clearSession();
        return;
      }

      setError(getErrorMessage(deleteError));
    } finally {
      setDeletingPlayerIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(player.id);
        return nextIds;
      });
    }
  }

  async function handleResetPassword(player: UserSummary): Promise<void> {
    const nextPassword = window.prompt(
      `请输入玩家 ${player.username} 的新密码（至少 6 位）`
    );
    if (nextPassword === null) {
      return;
    }

    setError(null);
    setNotice(null);
    setResettingPlayerIds((currentIds) => new Set(currentIds).add(player.id));

    try {
      await resetPlayerPassword(props.token, player.id, {
        password: nextPassword
      });
      setNotice(`已重置玩家 ${player.username} 的密码`);
    } catch (resetError) {
      if (isUnauthorizedError(resetError)) {
        clearSession();
        return;
      }

      setError(getErrorMessage(resetError));
    } finally {
      setResettingPlayerIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(player.id);
        return nextIds;
      });
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
          <button
            className={styles.secondaryButton}
            onClick={() => void signOut()}
          >
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
            <div className={styles.tableTools}>
              <input
                aria-label="搜索玩家"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索玩家"
                type="search"
                value={searchQuery}
              />
              <button
                className={styles.secondaryButton}
                disabled={isLoading}
                onClick={refreshPlayers}
              >
                {isLoading ? "刷新中" : "刷新"}
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className={styles.emptyState}>正在加载玩家列表</p>
          ) : players.length === 0 ? (
            <p className={styles.emptyState}>还没有玩家账号</p>
          ) : filteredPlayers.length === 0 ? (
            <p className={styles.emptyState}>没有匹配的玩家账号</p>
          ) : (
            <div className={styles.playerList}>
              {filteredPlayers.map((player) => (
                <article className={styles.playerRow} key={player.id}>
                  <div className={styles.playerInfo}>
                    <strong>{player.username}</strong>
                    <span>创建于 {formatDateTime(player.createdAt)}</span>
                  </div>
                  <div className={styles.playerActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={resettingPlayerIds.has(player.id)}
                      onClick={() => void handleResetPassword(player)}
                    >
                      {resettingPlayerIds.has(player.id) ? "重置中" : "重置密码"}
                    </button>
                    <button
                      className={styles.dangerButton}
                      disabled={deletingPlayerIds.has(player.id)}
                      onClick={() => void handleDeletePlayer(player)}
                    >
                      {deletingPlayerIds.has(player.id) ? "删除中" : "删除"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
