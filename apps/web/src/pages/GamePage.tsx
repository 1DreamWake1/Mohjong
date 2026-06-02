import type { Action, AuthUser } from "@mahjong/shared";
import { useEffect } from "react";

import styles from "../app/App.module.css";
import { APP_ROUTES, replaceRoute } from "../app/routes.js";
import { MahjongTable } from "../components/game/MahjongTable.js";
import { useAuthStore } from "../stores/authStore.js";
import { useGameStore } from "../stores/gameStore.js";
import { useSocketStore } from "../stores/socketStore.js";

type GamePageProps = {
  token: string;
  user: AuthUser;
};

export function GamePage(props: GamePageProps): JSX.Element {
  const signOut = useAuthStore((state) => state.signOut);
  const errorMessage = useGameStore((state) => state.errorMessage);
  const selectedTileId = useGameStore((state) => state.selectedTileId);
  const status = useGameStore((state) => state.status);
  const view = useGameStore((state) => state.view);
  const resetLiveGame = useGameStore((state) => state.resetLiveGame);
  const selectTile = useGameStore((state) => state.selectTile);
  const setErrorMessage = useGameStore((state) => state.setErrorMessage);
  const setStatus = useGameStore((state) => state.setStatus);
  const setView = useGameStore((state) => state.setView);
  const disconnectSocket = useSocketStore((state) => state.disconnectSocket);
  const prepareSocket = useSocketStore((state) => state.prepareSocket);
  const socket = useSocketStore((state) => state.socket);
  const socketStatus = useSocketStore((state) => state.status);

  const latestEvent = view.eventMessages.at(-1);

  useEffect(() => {
    prepareSocket(props.token);
    return () => {
      disconnectSocket();
      resetLiveGame();
    };
  }, [disconnectSocket, prepareSocket, props.token, resetLiveGame]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleState: Parameters<typeof socket.on<"game:state">>[1] = (payload) => {
      setView(payload.view);
    };
    const handleError: Parameters<typeof socket.on<"game:error">>[1] = (payload) => {
      setErrorMessage(payload.message);
    };
    const handleEnded: Parameters<typeof socket.on<"game:ended">>[1] = () => {
      setStatus("ended");
    };

    socket.on("game:state", handleState);
    socket.on("game:error", handleError);
    socket.on("game:ended", handleEnded);
    socket.connect();
    setStatus("joining");
    socket.emit("game:join", {});

    return () => {
      socket.off("game:state", handleState);
      socket.off("game:error", handleError);
      socket.off("game:ended", handleEnded);
    };
  }, [setErrorMessage, setStatus, setView, socket]);

  function handleAction(action: Action): void {
    if (!socket || action.type === "discard" && !action.tileId) {
      setErrorMessage(action.type === "discard" ? "请先选择要打出的手牌" : "Socket 未连接");
      return;
    }

    socket.emit("game:action", { action });
  }

  return (
    <main className={styles.gameShell}>
      <header className={styles.lobbyHeader}>
        <div>
          <p className={styles.kicker}>在线麻将</p>
          <h1>在线牌桌</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.roleBadge}>玩家</span>
          <span>{props.user.username}</span>
          <button
            className={styles.secondaryButton}
            onClick={() => replaceRoute(APP_ROUTES.lobby)}
            type="button"
          >
            返回大厅
          </button>
          <button className={styles.secondaryButton} onClick={() => void signOut()} type="button">
            退出
          </button>
        </div>
      </header>

      <section className={styles.gameLayout}>
        <aside className={styles.gameControls}>
          <section className={styles.lobbyPanel}>
            <div>
              <p className={styles.panelLabel}>快速对局</p>
              <h2>{status === "joining" ? "加入中" : view.phase === "ended" ? "已结束" : "进行中"}</h2>
            </div>
            <p className={styles.helperText}>
              Socket：{socketStatus === "connected" ? "已连接" : socketStatus === "ready" ? "准备中" : "未准备"}
            </p>
            {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          </section>

          <section className={styles.lobbyPanel}>
            <div>
              <p className={styles.panelLabel}>牌局提示</p>
              <h2>{view.phase === "ended" ? "结算" : "事件"}</h2>
            </div>
            <p className={styles.helperText}>{latestEvent?.text ?? "暂无事件"}</p>
            {view.winnerSeatIndex !== undefined ? (
              <span className={styles.statusBadge}>胜者 {view.winnerSeatIndex + 1}号位</span>
            ) : null}
          </section>
        </aside>

        <MahjongTable
          onAction={handleAction}
          onSelectTile={selectTile}
          selectedTileId={selectedTileId}
          view={view}
        />
      </section>
    </main>
  );
}
