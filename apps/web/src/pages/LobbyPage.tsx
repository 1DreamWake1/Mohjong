import type { AuthUser, GameLobbyRoom, GameLobbySeat } from "@mahjong/shared";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  createGameRoom,
  getCurrentGameRoom,
  joinGameRoom,
  leaveCurrentGameRoom,
  resetGameRoomForRematch,
  setGameRoomReady,
  startGameRoom
} from "../api/client.js";
import { isUnauthorizedError } from "../api/errors.js";
import styles from "../app/App.module.css";
import { APP_ROUTES, replaceRoute } from "../app/routes.js";
import { useAuthStore } from "../stores/authStore.js";
import { useSocketStore } from "../stores/socketStore.js";
import { formatDateTime } from "../utils/date.js";

type LobbyPageProps = {
  token: string;
  user: AuthUser;
};

const seatNames = ["东", "南", "西", "北"];

export function getRulePresetText(ruleName: GameLobbyRoom["ruleName"]): string {
  return ruleName === "standard" ? "标准规则" : "简单规则";
}

export function getLobbySeatText(seat: GameLobbySeat): string {
  if (seat.isBot) {
    return seat.username ?? "Bot";
  }

  return seat.username ?? "空座";
}

export function canStartLobbyRoom(room: GameLobbyRoom, userId: number): boolean {
  return (
    room.ownerUserId === userId &&
    room.status === "waiting" &&
    room.seats
      .filter((seat) => seat.userId !== undefined && !seat.isBot)
      .every((seat) => seat.isReady)
  );
}

export function canEnterLobbyGame(room: GameLobbyRoom | null): boolean {
  return room?.status === "playing";
}

export function canLeaveLobbyRoom(room: GameLobbyRoom | null): boolean {
  return room?.status === "waiting" || room?.status === "ended";
}

export function canCreateOrJoinLobbyRoom(room: GameLobbyRoom | null): boolean {
  return !room || room.status === "ended";
}

export function canResetLobbyRoom(room: GameLobbyRoom | null, userId: number): boolean {
  return room?.status === "ended" && room.ownerUserId === userId;
}

export function getLobbyRoomStatusText(room: GameLobbyRoom | null): string {
  if (room?.status === "waiting") {
    return "等待中";
  }
  if (room?.status === "playing") {
    return "进行中";
  }
  if (room?.status === "ended") {
    return "已结束";
  }

  return "-";
}

export function LobbyPage(props: LobbyPageProps): JSX.Element {
  const clearSession = useAuthStore((state) => state.clearSession);
  const signOut = useAuthStore((state) => state.signOut);
  const disconnectSocket = useSocketStore((state) => state.disconnectSocket);
  const prepareSocket = useSocketStore((state) => state.prepareSocket);
  const socket = useSocketStore((state) => state.socket);
  const socketStatus = useSocketStore((state) => state.status);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [selectedRuleName, setSelectedRuleName] = useState<"simple" | "standard">("simple");
  const [room, setRoom] = useState<GameLobbyRoom | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState(false);
  const createdAtText = useMemo(() => formatDateTime(props.user.createdAt), [props.user.createdAt]);
  const socketStatusText = socketStatus === "ready" ? "已准备" : "未准备";
  const currentSeat = room?.seats.find((seat) => seat.userId === props.user.id);
  const canStartRoom = room ? canStartLobbyRoom(room, props.user.id) : false;
  const canEnterGame = canEnterLobbyGame(room);
  const canLeaveRoom = canLeaveLobbyRoom(room);
  const canCreateOrJoinRoom = canCreateOrJoinLobbyRoom(room);
  const canResetRoom = canResetLobbyRoom(room, props.user.id);

  function handleRoomError(error: unknown): void {
    if (isUnauthorizedError(error)) {
      clearSession();
      return;
    }

    setRoomError(error instanceof Error ? error.message : "房间操作失败");
  }

  useEffect(() => {
    prepareSocket(props.token);
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket, prepareSocket, props.token]);

  useEffect(() => {
    let isActive = true;

    getCurrentGameRoom(props.token)
      .then((currentRoom) => {
        if (isActive) {
          setRoom(currentRoom);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          handleRoomError(error);
        }
      });

    return () => {
      isActive = false;
    };
  }, [props.token]);

  useEffect(() => {
    if (!socket || !room) {
      return;
    }

    const handleConnect = () => {
      socket.emit("lobby:watch", { roomId: room.roomId });
    };
    const handleLobbyRoom: Parameters<typeof socket.on<"lobby:room">>[1] = (payload) => {
      const isStillSeated = payload.room.seats.some((seat) => seat.userId === props.user.id);
      setRoom(isStillSeated ? payload.room : null);
    };

    socket.on("connect", handleConnect);
    socket.on("lobby:room", handleLobbyRoom);
    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobby:room", handleLobbyRoom);
    };
  }, [room?.roomId, socket]);

  async function handleCreateRoom(): Promise<void> {
    setIsRoomBusy(true);
    setRoomError(null);

    try {
      setRoom(await createGameRoom(props.token, { ruleName: selectedRuleName }));
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedRoomId = joinRoomId.trim();
    if (normalizedRoomId.length === 0) {
      setRoomError("请输入房间号");
      return;
    }

    setIsRoomBusy(true);
    setRoomError(null);

    try {
      setRoom(await joinGameRoom(props.token, normalizedRoomId));
      setJoinRoomId("");
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleToggleReady(): Promise<void> {
    if (!currentSeat || !room || room.status !== "waiting") {
      return;
    }

    setIsRoomBusy(true);
    setRoomError(null);

    try {
      setRoom(await setGameRoomReady(props.token, { isReady: !currentSeat.isReady }));
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleLeaveRoom(): Promise<void> {
    if (!canLeaveRoom) {
      return;
    }

    setIsRoomBusy(true);
    setRoomError(null);

    try {
      setRoom(await leaveCurrentGameRoom(props.token));
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleStartRoom(): Promise<void> {
    if (!room) {
      return;
    }

    setIsRoomBusy(true);
    setRoomError(null);

    try {
      const startedRoom = await startGameRoom(props.token);
      setRoom(startedRoom);
      replaceRoute(APP_ROUTES.gameDemo);
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleResetRoom(): Promise<void> {
    if (!canResetRoom) {
      return;
    }

    setIsRoomBusy(true);
    setRoomError(null);
    try {
      setRoom(await resetGameRoomForRematch(props.token));
    } catch (error) {
      handleRoomError(error);
    } finally {
      setIsRoomBusy(false);
    }
  }

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
          <button className={styles.secondaryButton} onClick={() => void signOut()}>
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
            <div>
              <dt>连接状态</dt>
              <dd>{socketStatusText}</dd>
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
            <button
              className={styles.primaryButton}
              disabled={isRoomBusy || Boolean(room)}
              onClick={() => replaceRoute(APP_ROUTES.gameDemo)}
              type="button"
            >
              快速开始
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => replaceRoute(APP_ROUTES.gameHistory)}
              type="button"
            >
              历史对局
            </button>
            <div aria-label="房间规则" className={styles.segmentedControls} role="group">
              <button
                className={
                  selectedRuleName === "simple" ? styles.segmentButtonActive : styles.segmentButton
                }
                disabled={isRoomBusy || !canCreateOrJoinRoom}
                onClick={() => setSelectedRuleName("simple")}
                type="button"
              >
                简单规则
              </button>
              <button
                className={
                  selectedRuleName === "standard"
                    ? styles.segmentButtonActive
                    : styles.segmentButton
                }
                disabled={isRoomBusy || !canCreateOrJoinRoom}
                onClick={() => setSelectedRuleName("standard")}
                type="button"
              >
                标准规则
              </button>
            </div>
            <button
              className={styles.secondaryButton}
              disabled={isRoomBusy || !canCreateOrJoinRoom}
              onClick={() => void handleCreateRoom()}
              type="button"
            >
              创建房间
            </button>
            <form
              className={styles.inlineJoinForm}
              onSubmit={(event) => void handleJoinRoom(event)}
            >
              <input
                aria-label="房间号"
                onChange={(event) => setJoinRoomId(event.target.value)}
                placeholder="输入房间号"
                value={joinRoomId}
              />
              <button
                className={styles.secondaryButton}
                disabled={isRoomBusy || !canCreateOrJoinRoom}
                type="submit"
              >
                加入房间
              </button>
            </form>
          </div>
          {roomError ? <p className={styles.error}>{roomError}</p> : null}
        </section>

        <section className={styles.lobbyPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelLabel}>当前房间</p>
              <h2>{room?.roomId ?? "暂无房间"}</h2>
            </div>
            <span className={styles.statusBadge}>{getLobbyRoomStatusText(room)}</span>
          </div>
          {room ? (
            <>
              <div className={styles.roomSeatGrid}>
                {room.seats.map((seat) => (
                  <div className={styles.roomSeat} key={seat.seatIndex}>
                    <span>{seatNames[seat.seatIndex]}位</span>
                    <strong>{getLobbySeatText(seat)}</strong>
                    <small>{seat.isReady ? "已准备" : "未准备"}</small>
                  </div>
                ))}
              </div>
              <p className={styles.roomRuleSummary}>
                {getRulePresetText(room.ruleName)} v{room.ruleVersion ?? 1}
              </p>
              <div className={styles.roomActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={isRoomBusy || !currentSeat || room.status !== "waiting"}
                  onClick={() => void handleToggleReady()}
                  type="button"
                >
                  {currentSeat?.isReady ? "取消准备" : "准备"}
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={isRoomBusy || !canStartRoom}
                  onClick={() => void handleStartRoom()}
                  type="button"
                >
                  开始房间
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={!canEnterGame}
                  onClick={() => replaceRoute(APP_ROUTES.gameDemo)}
                  type="button"
                >
                  进入牌桌
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={isRoomBusy || !canLeaveRoom}
                  onClick={() => void handleLeaveRoom()}
                  type="button"
                >
                  退出房间
                </button>
                {room.status === "ended" ? (
                  canResetRoom ? (
                    <button
                      className={styles.primaryButton}
                      disabled={isRoomBusy}
                      onClick={() => void handleResetRoom()}
                      type="button"
                    >
                      召集原成员
                    </button>
                  ) : (
                    <span className={styles.helperText}>等待房主再开一局</span>
                  )
                ) : null}
              </div>
            </>
          ) : (
            <p className={styles.emptyState}>创建房间或输入房间号加入</p>
          )}
        </section>
      </section>
    </main>
  );
}
