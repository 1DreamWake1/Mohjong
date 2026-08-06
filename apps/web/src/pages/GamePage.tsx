import type {
  Action,
  AuthUser,
  GameEventMessage,
  GamePhase,
  GameResultInfo
} from "@mahjong/shared";
import { useEffect, useRef, useState } from "react";

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

export function getGameConnectRequest(
  roomId: string
): { event: "game:start" } | { event: "game:sync"; payload: { gameId: string } } {
  if (roomId.startsWith("quick-")) {
    return { event: "game:sync", payload: { gameId: roomId } };
  }

  return { event: "game:start" };
}

export function canRestartGame(phase: GamePhase): boolean {
  return phase === "ended";
}

export function getGameEndAction(roomId: string): "restart" | "return-to-room" {
  return roomId.startsWith("quick-") ? "restart" : "return-to-room";
}

export function getReturnToLobbyConfirmation(phase: GamePhase, roomId: string): string | null {
  if (phase === "ended") {
    return null;
  }

  return roomId.startsWith("quick-")
    ? "返回大厅将直接结束当前单人牌局，确认返回？"
    : "返回大厅后将由机器人接手你的座位继续牌局，确认返回？";
}

export function getSignOutDuringGameConfirmation(phase: GamePhase, roomId: string): string | null {
  if (phase === "ended") {
    return null;
  }

  return roomId.startsWith("quick-")
    ? "退出登录将直接结束当前单人牌局，确认退出？"
    : "退出登录后将由机器人接手你的座位继续牌局，确认退出？";
}

export function getRecentGameEvents(events: GameEventMessage[], limit = 5): GameEventMessage[] {
  return events.slice(-limit).reverse();
}

export function getGameResultSummary(result: GameResultInfo): {
  fanText: string | null;
  scoreText: string;
  title: string;
  winTypeText: string | null;
  winningTileText: string | null;
} {
  const winTypeText =
    result.winType === "selfDraw" ? "自摸" : result.winType === "discard" ? "点炮" : null;

  return {
    fanText:
      result.fans.length > 0
        ? result.fans.map((fan) => `${fan.name} ${fan.value}番`).join("、")
        : null,
    scoreText: result.endReason === "hu" ? `${result.totalPoints} 分` : "无人胡牌",
    title: result.endReason === "hu" ? "胡牌结算" : "流局",
    winTypeText,
    winningTileText: result.winningTile ? `胡牌：${result.winningTile.label}` : null
  };
}

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
  const [eventNotice, setEventNotice] = useState<string | null>(null);

  const recentEvents = getRecentGameEvents(view.eventMessages);
  const resultSummary = view.result ? getGameResultSummary(view.result) : null;
  const latestRoomIdRef = useRef(view.roomId);
  const pendingSignOutRef = useRef(false);

  useEffect(() => {
    latestRoomIdRef.current = view.roomId;
  }, [view.roomId]);

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
    const handleLeft: Parameters<typeof socket.on<"game:left">>[1] = () => {
      if (pendingSignOutRef.current) {
        pendingSignOutRef.current = false;
        void signOut();
        return;
      }

      replaceRoute(APP_ROUTES.lobby);
    };
    const handleTimeout: Parameters<typeof socket.on<"game:timeout">>[1] = (payload) => {
      setErrorMessage(payload.message);
    };
    const handleEvent: Parameters<typeof socket.on<"game:event">>[1] = (payload) => {
      setEventNotice(payload.message);
    };
    const handleConnect = () => {
      const request = getGameConnectRequest(latestRoomIdRef.current);
      if (request.event === "game:start") {
        socket.emit(request.event);
        return;
      }

      socket.emit(request.event, request.payload);
    };

    socket.on("connect", handleConnect);
    socket.on("game:state", handleState);
    socket.on("game:error", handleError);
    socket.on("game:event", handleEvent);
    socket.on("game:timeout", handleTimeout);
    socket.on("game:ended", handleEnded);
    socket.on("game:left", handleLeft);
    socket.connect();
    setStatus("joining");

    return () => {
      socket.off("connect", handleConnect);
      socket.off("game:state", handleState);
      socket.off("game:error", handleError);
      socket.off("game:event", handleEvent);
      socket.off("game:timeout", handleTimeout);
      socket.off("game:ended", handleEnded);
      socket.off("game:left", handleLeft);
    };
  }, [setErrorMessage, setStatus, setView, signOut, socket]);

  function handleAction(action: Action): void {
    if (!socket || (action.type === "discard" && !action.tileId)) {
      setErrorMessage(action.type === "discard" ? "请先选择要打出的手牌" : "Socket 未连接");
      return;
    }

    socket.emit("game:action", { action });
  }

  function handleRestartGame(): void {
    if (getGameEndAction(view.roomId) === "return-to-room") {
      replaceRoute(APP_ROUTES.lobby);
      return;
    }

    if (!socket) {
      setErrorMessage("Socket 未连接");
      return;
    }

    setStatus("joining");
    setErrorMessage(null);
    socket.emit("game:join", {});
  }

  function handleReturnToLobby(): void {
    const confirmation = getReturnToLobbyConfirmation(view.phase, view.roomId);
    if (!confirmation) {
      replaceRoute(APP_ROUTES.lobby);
      return;
    }

    if (!window.confirm(confirmation)) {
      return;
    }

    if (!socket) {
      setErrorMessage("Socket 未连接");
      return;
    }

    socket.emit("game:leave");
  }

  function handleSignOut(): void {
    const confirmation = getSignOutDuringGameConfirmation(view.phase, view.roomId);
    if (!confirmation) {
      void signOut();
      return;
    }

    if (!window.confirm(confirmation)) {
      return;
    }

    if (!socket) {
      setErrorMessage("Socket 未连接");
      return;
    }

    pendingSignOutRef.current = true;
    socket.emit("game:leave");
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
          <button className={styles.secondaryButton} onClick={handleReturnToLobby} type="button">
            返回大厅
          </button>
          <button className={styles.secondaryButton} onClick={handleSignOut} type="button">
            退出
          </button>
        </div>
      </header>

      <section className={styles.gameLayout}>
        <aside className={styles.gameControls}>
          <section className={styles.lobbyPanel}>
            <div>
              <p className={styles.panelLabel}>快速对局</p>
              <h2>
                {status === "joining" ? "加入中" : view.phase === "ended" ? "已结束" : "进行中"}
              </h2>
            </div>
            <p className={styles.helperText}>
              Socket：
              {socketStatus === "connected"
                ? "已连接"
                : socketStatus === "ready"
                  ? "准备中"
                  : "未准备"}
            </p>
            {canRestartGame(view.phase) ? (
              <button className={styles.secondaryButton} onClick={handleRestartGame} type="button">
                {getGameEndAction(view.roomId) === "restart" ? "再开一局" : "返回原房间"}
              </button>
            ) : null}
            {eventNotice ? <p className={styles.helperText}>{eventNotice}</p> : null}
            {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          </section>

          <section className={styles.lobbyPanel}>
            <div>
              <p className={styles.panelLabel}>牌局提示</p>
              <h2>{view.phase === "ended" ? "结算" : "事件"}</h2>
            </div>
            {recentEvents.length > 0 ? (
              <ol className={styles.eventList} aria-label="最近牌局事件">
                {recentEvents.map((event) => (
                  <li key={event.id}>{event.text}</li>
                ))}
              </ol>
            ) : (
              <p className={styles.helperText}>暂无事件</p>
            )}
            {view.winnerSeatIndex !== undefined ? (
              <span className={styles.statusBadge}>胜者 {view.winnerSeatIndex + 1}号位</span>
            ) : null}
            {resultSummary ? (
              <div className={styles.resultSummary}>
                <strong>{resultSummary.title}</strong>
                <span>{resultSummary.scoreText}</span>
                {resultSummary.winTypeText ? <p>方式：{resultSummary.winTypeText}</p> : null}
                {resultSummary.winningTileText ? <p>{resultSummary.winningTileText}</p> : null}
                {resultSummary.fanText ? <p>{resultSummary.fanText}</p> : null}
                {view.waitingTiles && view.waitingTiles.length > 0 ? (
                  <p>听牌：{view.waitingTiles.map((tile) => tile.label).join("、")}</p>
                ) : null}
              </div>
            ) : null}
            {view.winnerResults && view.winnerResults.length > 0 ? (
              <div className={styles.resultSummary}>
                <strong>赢家明细</strong>
                {view.winnerResults.map((winner) => (
                  <p key={`${winner.winnerSeatIndex}-${winner.winningTile?.id ?? "win"}`}>
                    {winner.winnerSeatIndex + 1}号位 ·{" "}
                    {winner.winType === "selfDraw" ? "自摸" : "点炮"} · {winner.totalPoints} 分
                  </p>
                ))}
              </div>
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
