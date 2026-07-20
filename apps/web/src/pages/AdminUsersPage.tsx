import type {
  AdminGameHistoryDetail,
  AdminGameHistoryItem,
  AdminActiveRoom,
  AdminPersistenceDiagnostic,
  AuthUser,
  UserSummary
} from "@mahjong/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  createPlayer,
  deletePlayer,
  getAdminGameRecord,
  listAdminActiveRooms,
  listAdminPersistenceDiagnostics,
  listAdminGameRecords,
  listPlayers,
  resetPlayerPassword
} from "../api/client.js";
import { getErrorMessage, isUnauthorizedError } from "../api/errors.js";
import styles from "../app/App.module.css";
import { MahjongTable } from "../components/game/MahjongTable.js";
import { TileGallery } from "../components/game/TileGallery.js";
import { useAuthStore } from "../stores/authStore.js";
import { formatDateTime } from "../utils/date.js";

type AdminUsersPageProps = {
  token: string;
  user: AuthUser;
};

type AdminView = "games" | "players" | "tiles";

export function filterAdminGameRecords(
  records: readonly AdminGameHistoryItem[],
  query: string,
  status: "all" | "playing" | "ended" | "abnormal",
  endReason: "all" | "hu" | "draw" | "abnormal" = "all",
  startedFrom = "",
  startedTo = ""
): AdminGameHistoryItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const fromTimestamp = startedFrom
    ? Date.parse(`${startedFrom}T00:00:00`)
    : Number.NEGATIVE_INFINITY;
  const toTimestamp = startedTo
    ? Date.parse(`${startedTo}T23:59:59.999`)
    : Number.POSITIVE_INFINITY;
  return records.filter((record) => {
    const matchesQuery =
      !normalizedQuery ||
      record.roomId.toLowerCase().includes(normalizedQuery) ||
      record.playerUsername?.toLowerCase().includes(normalizedQuery) === true ||
      record.playerUserId?.toString() === normalizedQuery;
    const matchesStatus =
      status === "all" ||
      (status === "abnormal" ? record.endReason === "abnormal" : record.status === status);
    const matchesEndReason = endReason === "all" || record.endReason === endReason;
    const startedAt = Date.parse(record.startedAt);
    return (
      matchesQuery &&
      matchesStatus &&
      matchesEndReason &&
      startedAt >= fromTimestamp &&
      startedAt <= toTimestamp
    );
  });
}

function getAdminGameResultText(record: AdminGameHistoryItem): string {
  if (record.status === "playing") return "进行中";
  if (record.endReason === "abnormal") return "异常结束";
  if (record.endReason === "draw") return "流局";
  if (record.winType === "selfDraw") return "自摸";
  if (record.winType === "discard") return "点炮";
  return "已结束";
}

export function AdminUsersPage(props: AdminUsersPageProps): JSX.Element {
  const clearSession = useAuthStore((state) => state.clearSession);
  const signOut = useAuthStore((state) => state.signOut);
  const [activeView, setActiveView] = useState<AdminView>("players");
  const [players, setPlayers] = useState<UserSummary[]>([]);
  const [gameRecords, setGameRecords] = useState<AdminGameHistoryItem[]>([]);
  const [activeRooms, setActiveRooms] = useState<AdminActiveRoom[]>([]);
  const [persistenceDiagnostics, setPersistenceDiagnostics] = useState<
    AdminPersistenceDiagnostic[]
  >([]);
  const [selectedGame, setSelectedGame] = useState<AdminGameHistoryDetail | null>(null);
  const [gameSearchQuery, setGameSearchQuery] = useState("");
  const [gameStatus, setGameStatus] = useState<"all" | "playing" | "ended" | "abnormal">("all");
  const [gameEndReason, setGameEndReason] = useState<"all" | "hu" | "draw" | "abnormal">("all");
  const [gameStartedFrom, setGameStartedFrom] = useState("");
  const [gameStartedTo, setGameStartedTo] = useState("");
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<number>>(() => new Set());
  const [resettingPlayerIds, setResettingPlayerIds] = useState<Set<number>>(() => new Set());
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
  const filteredGameRecords = useMemo(
    () =>
      filterAdminGameRecords(
        gameRecords,
        gameSearchQuery,
        gameStatus,
        gameEndReason,
        gameStartedFrom,
        gameStartedTo
      ),
    [gameEndReason, gameRecords, gameSearchQuery, gameStartedFrom, gameStartedTo, gameStatus]
  );
  const selectedEvent = selectedGame?.events[selectedEventIndex];

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

  async function refreshGames(): Promise<void> {
    setError(null);
    setIsLoadingGames(true);
    try {
      const [records, rooms, diagnostics] = await Promise.all([
        listAdminGameRecords(props.token),
        listAdminActiveRooms(props.token),
        listAdminPersistenceDiagnostics(props.token)
      ]);
      setGameRecords(records);
      setActiveRooms(rooms);
      setPersistenceDiagnostics(diagnostics);
      const roomId = selectedGame?.roomId ?? records[0]?.roomId;
      setSelectedGame(roomId ? await getAdminGameRecord(props.token, roomId) : null);
      setSelectedEventIndex(0);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        return;
      }
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingGames(false);
    }
  }

  async function selectGame(roomId: string): Promise<void> {
    setError(null);
    setIsLoadingGames(true);
    try {
      setSelectedGame(await getAdminGameRecord(props.token, roomId));
      setSelectedEventIndex(0);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        return;
      }
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingGames(false);
    }
  }

  useEffect(() => {
    if (activeView === "games" && gameRecords.length === 0) {
      void refreshGames();
    }
  }, [activeView]);

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
      setPlayers((currentPlayers) => currentPlayers.filter((item) => item.id !== player.id));
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
    const nextPassword = window.prompt(`请输入玩家 ${player.username} 的新密码（至少 6 位）`);
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
          <h1>系统管理</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.roleBadge}>管理员</span>
          <span>{props.user.username}</span>
          <button className={styles.secondaryButton} onClick={() => void signOut()}>
            退出
          </button>
        </div>
      </header>

      <nav className={styles.adminTabs} aria-label="管理员功能">
        <button
          className={activeView === "games" ? styles.adminTabActive : styles.adminTab}
          onClick={() => setActiveView("games")}
          type="button"
        >
          对局管理
        </button>
        <button
          className={activeView === "players" ? styles.adminTabActive : styles.adminTab}
          onClick={() => setActiveView("players")}
          type="button"
        >
          玩家账号
        </button>
        <button
          className={activeView === "tiles" ? styles.adminTabActive : styles.adminTab}
          onClick={() => setActiveView("tiles")}
          type="button"
        >
          牌面样式
        </button>
      </nav>

      {activeView === "players" ? (
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
      ) : activeView === "games" ? (
        <section className={styles.adminGameLayout}>
          {persistenceDiagnostics.length > 0 ? (
            <section className={`${styles.tablePanel} ${styles.adminDiagnosticsPanel}`}>
              <div className={styles.tableHeader}>
                <div>
                  <h2>持久化诊断</h2>
                  <p>本次服务运行期间最近 {persistenceDiagnostics.length} 条写入失败</p>
                </div>
              </div>
              <div className={styles.adminDiagnosticsList}>
                {persistenceDiagnostics.map((diagnostic) => (
                  <article key={diagnostic.id}>
                    <span>{formatDateTime(diagnostic.createdAt)}</span>
                    <strong>{diagnostic.roomId}</strong>
                    <code>{diagnostic.operation}</code>
                    <p>{diagnostic.message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className={`${styles.tablePanel} ${styles.adminActiveRoomsPanel}`}>
            <div className={styles.tableHeader}>
              <div>
                <h2>活跃房间</h2>
                <p>{activeRooms.length} 个等待、进行中或待清理房间</p>
              </div>
            </div>
            <div className={styles.adminActiveRoomList}>
              {activeRooms.map((room) => (
                <article key={room.roomId}>
                  <header>
                    <strong>{room.roomId}</strong>
                    <span>{room.status}</span>
                    <small>{formatDateTime(room.updatedAt)} 更新</small>
                  </header>
                  <div>
                    {room.seats.map((seat) => (
                      <span data-status={seat.connectionStatus} key={seat.seatIndex}>
                        {seat.seatIndex + 1}号位 {seat.username ?? "空位"} ·
                        {seat.connectionStatus === "online"
                          ? "在线"
                          : seat.connectionStatus === "bot"
                            ? "Bot"
                            : seat.connectionStatus === "empty"
                              ? "空闲"
                              : "断线"}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {!isLoadingGames && activeRooms.length === 0 ? (
                <p className={styles.emptyState}>当前没有活跃房间</p>
              ) : null}
            </div>
          </section>
          <section className={styles.tablePanel}>
            <div className={styles.tableHeader}>
              <div>
                <h2>对局列表</h2>
                <p>
                  {filteredGameRecords.length} / {gameRecords.length} 局
                </p>
              </div>
              <button
                className={styles.secondaryButton}
                disabled={isLoadingGames}
                onClick={refreshGames}
              >
                {isLoadingGames ? "刷新中" : "刷新"}
              </button>
            </div>
            <div className={styles.adminGameFilters}>
              <input
                aria-label="搜索房间号"
                onChange={(event) => setGameSearchQuery(event.target.value)}
                placeholder="房间号、玩家名或 ID"
                type="search"
                value={gameSearchQuery}
              />
              <select
                aria-label="对局状态"
                onChange={(event) => setGameStatus(event.target.value as typeof gameStatus)}
                value={gameStatus}
              >
                <option value="all">全部状态</option>
                <option value="playing">进行中</option>
                <option value="ended">已结束</option>
                <option value="abnormal">异常结束</option>
              </select>
              <select
                aria-label="结束原因"
                onChange={(event) => setGameEndReason(event.target.value as typeof gameEndReason)}
                value={gameEndReason}
              >
                <option value="all">全部结果</option>
                <option value="hu">胡牌</option>
                <option value="draw">流局</option>
                <option value="abnormal">异常</option>
              </select>
              <label>
                <span>开始日期</span>
                <input
                  aria-label="开始日期"
                  onChange={(event) => setGameStartedFrom(event.target.value)}
                  type="date"
                  value={gameStartedFrom}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  aria-label="结束日期"
                  min={gameStartedFrom || undefined}
                  onChange={(event) => setGameStartedTo(event.target.value)}
                  type="date"
                  value={gameStartedTo}
                />
              </label>
            </div>
            <div className={styles.adminGameList}>
              {filteredGameRecords.map((record) => (
                <button
                  className={
                    selectedGame?.roomId === record.roomId
                      ? styles.adminGameRowActive
                      : styles.adminGameRow
                  }
                  key={record.roomId}
                  onClick={() => void selectGame(record.roomId)}
                  type="button"
                >
                  <span>
                    <strong>{record.roomId}</strong>
                    <small>
                      {record.ruleName} v{record.ruleVersion ?? 1}
                    </small>
                  </span>
                  <span>
                    <strong>{getAdminGameResultText(record)}</strong>
                    <small>{record.playerUsername ?? `玩家 #${record.playerUserId ?? "-"}`}</small>
                    <small>{formatDateTime(record.startedAt)}</small>
                  </span>
                </button>
              ))}
              {!isLoadingGames && filteredGameRecords.length === 0 ? (
                <p className={styles.emptyState}>没有匹配的对局</p>
              ) : null}
            </div>
          </section>
          <section className={styles.tablePanel}>
            <div className={styles.tableHeader}>
              <div>
                <h2>对局详情</h2>
                <p>{selectedGame?.roomId ?? "未选择对局"}</p>
              </div>
            </div>
            {selectedGame ? (
              <>
                <dl className={styles.adminGameSummary}>
                  <div>
                    <dt>状态</dt>
                    <dd>{getAdminGameResultText(selectedGame)}</dd>
                  </div>
                  <div>
                    <dt>规则</dt>
                    <dd>
                      {selectedGame.ruleName} v{selectedGame.ruleVersion ?? 1}
                    </dd>
                  </div>
                  <div>
                    <dt>总分</dt>
                    <dd>{selectedGame.totalPoints ?? 0}</dd>
                  </div>
                  <div>
                    <dt>玩家</dt>
                    <dd>
                      {selectedGame.playerUsername ?? `玩家 #${selectedGame.playerUserId ?? "-"}`}
                    </dd>
                  </div>
                  <div>
                    <dt>开始时间</dt>
                    <dd>{formatDateTime(selectedGame.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>结束时间</dt>
                    <dd>{selectedGame.endedAt ? formatDateTime(selectedGame.endedAt) : "-"}</dd>
                  </div>
                  <div>
                    <dt>胜者</dt>
                    <dd>
                      {selectedGame.winnerSeatIndex === undefined
                        ? "-"
                        : `${selectedGame.winnerSeatIndex + 1}号位`}
                    </dd>
                  </div>
                  <div>
                    <dt>胡牌方式</dt>
                    <dd>
                      {selectedGame.winType === "selfDraw"
                        ? "自摸"
                        : selectedGame.winType === "discard"
                          ? "点炮"
                          : "-"}
                    </dd>
                  </div>
                </dl>
                {selectedGame.result ? (
                  <div className={styles.resultSummary}>
                    <strong>结算明细</strong>
                    <p>
                      番数：{selectedGame.result.fanTotal}，总分：
                      {selectedGame.result.totalPoints}
                    </p>
                    <p>
                      {selectedGame.result.fans.length > 0
                        ? selectedGame.result.fans
                            .map((fan) => `${fan.name} ${fan.value}番`)
                            .join("、")
                        : "无番型记录"}
                    </p>
                  </div>
                ) : null}
                {selectedEvent?.viewSnapshot ? (
                  <div className={styles.historyReplayTable}>
                    <MahjongTable
                      onAction={() => undefined}
                      onSelectTile={() => undefined}
                      selectedTileId={null}
                      view={{ ...selectedEvent.viewSnapshot, availableActions: [] }}
                    />
                  </div>
                ) : null}
                <div className={styles.adminEventList}>
                  {selectedGame.events.map((event, index) => (
                    <button
                      className={
                        index === selectedEventIndex ? styles.adminGameRowActive : undefined
                      }
                      key={event.id}
                      onClick={() => setSelectedEventIndex(index)}
                      type="button"
                    >
                      <span>{formatDateTime(event.createdAt)}</span>
                      <strong>{event.text}</strong>
                      <small>{event.viewSnapshot ? "含牌桌快照" : "仅事件记录"}</small>
                    </button>
                  ))}
                  {selectedGame.events.length === 0 ? (
                    <p className={styles.emptyState}>暂无事件</p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className={styles.emptyState}>从左侧选择一局对局</p>
            )}
          </section>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      ) : (
        <section className={styles.tilePreviewPanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>牌面样式</h2>
              <p>34 种基础牌面渲染预览</p>
            </div>
          </div>
          <TileGallery />
        </section>
      )}
    </main>
  );
}
