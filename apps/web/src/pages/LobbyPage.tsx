import type { AuthUser } from "@mahjong/shared";
import { useEffect, useMemo } from "react";

import styles from "../app/App.module.css";
import { createGameSocket } from "../socket/socketClient.js";
import { useAuthStore } from "../stores/authStore.js";

type LobbyPageProps = {
  token: string;
  user: AuthUser;
};

export function LobbyPage(props: LobbyPageProps): JSX.Element {
  const signOut = useAuthStore((state) => state.signOut);
  const createdAtText = useMemo(
    () => new Date(props.user.createdAt).toLocaleString(),
    [props.user.createdAt]
  );

  useEffect(() => {
    const socket = createGameSocket(props.token);
    return () => {
      socket.disconnect();
    };
  }, [props.token]);

  return (
    <main className={styles.lobbyShell}>
      <header className={styles.lobbyHeader}>
        <div>
          <p className={styles.kicker}>在线麻将</p>
          <h1>玩家大厅</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.roleBadge}>玩家</span>
          <span>{props.user.username}</span>
          <button
            className={styles.secondaryButton}
            onClick={() => void signOut()}
          >
            退出
          </button>
        </div>
      </header>

      <section className={styles.lobbyGrid}>
        <section className={styles.lobbyPanel}>
          <div>
            <p className={styles.panelLabel}>欢迎回来</p>
            <h2>{props.user.username}</h2>
          </div>
          <dl className={styles.accountSummary}>
            <div>
              <dt>账号身份</dt>
              <dd>玩家</dd>
            </div>
            <div>
              <dt>账号创建时间</dt>
              <dd>{createdAtText}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.lobbyPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelLabel}>下一步</p>
              <h2>进入游戏</h2>
            </div>
            <span className={styles.statusBadge}>准备中</span>
          </div>
          <div className={styles.actionStack}>
            <button className={styles.primaryButton} disabled>
              快速开始
            </button>
            <button className={styles.secondaryButton} disabled>
              创建房间
            </button>
            <button className={styles.secondaryButton} disabled>
              加入房间
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
