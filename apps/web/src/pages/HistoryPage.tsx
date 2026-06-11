import type { AuthUser, GameHistoryDetail, GameHistoryItem, PlayerView } from "@mahjong/shared";
import { useEffect, useMemo, useState } from "react";

import { getGameHistory, listGameHistory } from "../api/client.js";
import { getErrorMessage, isUnauthorizedError } from "../api/errors.js";
import styles from "../app/App.module.css";
import { APP_ROUTES, replaceRoute } from "../app/routes.js";
import { MahjongTable } from "../components/game/MahjongTable.js";
import { useAuthStore } from "../stores/authStore.js";
import { formatDateTime } from "../utils/date.js";

type HistoryPageProps = {
  token: string;
  user: AuthUser;
};

export type GameHistoryFilter = "all" | "playing" | "ended" | "hu" | "draw";

const gameHistoryFilters: Array<{ label: string; value: GameHistoryFilter }> = [
  { label: "全部", value: "all" },
  { label: "进行中", value: "playing" },
  { label: "已结束", value: "ended" },
  { label: "胡牌", value: "hu" },
  { label: "流局", value: "draw" }
];

export function getGameHistoryResultText(record: GameHistoryItem): string {
  if (record.status !== "ended") {
    return "进行中";
  }

  if (record.endReason === "draw") {
    return "流局";
  }

  const winTypeText =
    record.winType === "selfDraw" ? "自摸" : record.winType === "discard" ? "点炮" : "胡牌";
  const scoreText = record.totalPoints === undefined ? "" : `，${record.totalPoints} 分`;

  return `${winTypeText}${scoreText}`;
}

export function sortGameHistory(records: GameHistoryItem[]): GameHistoryItem[] {
  return [...records].sort((leftRecord, rightRecord) =>
    rightRecord.startedAt.localeCompare(leftRecord.startedAt)
  );
}

export function getGameHistoryFanText(record: GameHistoryDetail): string | null {
  if (!record.result || record.result.fans.length === 0) {
    return null;
  }

  return record.result.fans.map((fan) => `${fan.name} ${fan.value}番`).join("、");
}

export function getReplayProgressText(currentIndex: number, total: number): string {
  if (total <= 0) {
    return "0 / 0";
  }

  const normalizedIndex = Math.min(Math.max(currentIndex, 0), total - 1);
  return `${normalizedIndex + 1} / ${total}`;
}

export function getNextReplayIndex(
  currentIndex: number,
  total: number,
  direction: "previous" | "next"
): number {
  if (total <= 0) {
    return 0;
  }

  const delta = direction === "next" ? 1 : -1;
  return Math.min(Math.max(currentIndex + delta, 0), total - 1);
}

export function createReadonlyReplayView(view: PlayerView): PlayerView {
  return {
    ...view,
    availableActions: []
  };
}

export function filterGameHistory(
  records: GameHistoryItem[],
  filter: GameHistoryFilter,
  searchQuery: string
): GameHistoryItem[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return records.filter((record) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "playing" && record.status === "playing") ||
      (filter === "ended" && record.status === "ended") ||
      (filter === "hu" && record.endReason === "hu") ||
      (filter === "draw" && record.endReason === "draw");
    const matchesSearch =
      normalizedQuery.length === 0 || record.roomId.toLowerCase().includes(normalizedQuery);

    return matchesFilter && matchesSearch;
  });
}

export function HistoryPage(props: HistoryPageProps): JSX.Element {
  const clearSession = useAuthStore((state) => state.clearSession);
  const signOut = useAuthStore((state) => state.signOut);
  const [records, setRecords] = useState<GameHistoryItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<GameHistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<GameHistoryFilter>("all");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredRecords = useMemo(
    () => sortGameHistory(filterGameHistory(records, activeFilter, searchQuery)),
    [activeFilter, records, searchQuery]
  );
  const selectedFanText = selectedRecord ? getGameHistoryFanText(selectedRecord) : null;
  const replayEvents = selectedRecord?.events ?? [];
  const replayEvent = replayEvents[replayIndex];
  const replayView = replayEvent?.viewSnapshot
    ? createReadonlyReplayView(replayEvent.viewSnapshot)
    : null;

  async function refreshHistory(): Promise<void> {
    setError(null);
    setIsLoadingList(true);

    try {
      const nextRecords = await listGameHistory(props.token);
      setRecords(nextRecords);
      const nextRoomId = selectedRoomId ?? nextRecords[0]?.roomId ?? null;
      setSelectedRoomId(nextRoomId);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        return;
      }

      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingList(false);
    }
  }

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedRoomId(null);
      return;
    }

    if (!selectedRoomId || !filteredRecords.some((record) => record.roomId === selectedRoomId)) {
      setSelectedRoomId(filteredRecords[0]?.roomId ?? null);
    }
  }, [filteredRecords, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setSelectedRecord(null);
      return;
    }

    let isActive = true;
    setError(null);
    setIsLoadingDetail(true);

    getGameHistory(props.token, selectedRoomId)
      .then((record) => {
        if (isActive) {
          setSelectedRecord(record);
        }
      })
      .catch((loadError: unknown) => {
        if (!isActive) {
          return;
        }

        if (isUnauthorizedError(loadError)) {
          clearSession();
          return;
        }

        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [clearSession, props.token, selectedRoomId]);

  useEffect(() => {
    setIsReplayPlaying(false);
    setReplayIndex(0);
  }, [selectedRecord?.roomId]);

  useEffect(() => {
    if (!isReplayPlaying || replayEvents.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setReplayIndex((currentIndex) => {
        if (currentIndex >= replayEvents.length - 1) {
          setIsReplayPlaying(false);
          return currentIndex;
        }

        return currentIndex + 1;
      });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [isReplayPlaying, replayEvents.length]);

  return (
    <main className={styles.lobbyShell}>
      <header className={styles.lobbyHeader}>
        <div>
          <p className={styles.kicker}>在线麻将</p>
          <h1>历史对局</h1>
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

      <section className={styles.lobbyGrid}>
        <section className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>对局列表</h2>
              <p>
                {filteredRecords.length} / {records.length} 条记录
              </p>
            </div>
            <div className={styles.tableTools}>
              <input
                aria-label="搜索房间号"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索房间号"
                type="search"
                value={searchQuery}
              />
              <button
                className={styles.secondaryButton}
                disabled={isLoadingList}
                onClick={() => void refreshHistory()}
                type="button"
              >
                {isLoadingList ? "刷新中" : "刷新"}
              </button>
            </div>
          </div>

          <div className={styles.historyFilters} aria-label="历史对局筛选">
            {gameHistoryFilters.map((filter) => (
              <button
                className={
                  activeFilter === filter.value ? styles.segmentButtonActive : styles.segmentButton
                }
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isLoadingList ? (
            <p className={styles.emptyState}>正在加载历史对局</p>
          ) : records.length === 0 ? (
            <p className={styles.emptyState}>暂无历史对局</p>
          ) : filteredRecords.length === 0 ? (
            <p className={styles.emptyState}>没有匹配的历史对局</p>
          ) : (
            <div className={styles.playerList}>
              {filteredRecords.map((record) => (
                <button
                  className={
                    selectedRoomId === record.roomId ? styles.historyRowActive : styles.historyRow
                  }
                  key={record.roomId}
                  onClick={() => setSelectedRoomId(record.roomId)}
                  type="button"
                >
                  <span>
                    <strong>{record.roomId}</strong>
                    <small>{formatDateTime(record.startedAt)}</small>
                  </span>
                  <em>{getGameHistoryResultText(record)}</em>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.lobbyPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelLabel}>详情</p>
              <h2>{selectedRecord?.roomId ?? "选择对局"}</h2>
            </div>
            {selectedRecord ? (
              <span className={styles.statusBadge}>{getGameHistoryResultText(selectedRecord)}</span>
            ) : null}
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          {isLoadingDetail ? <p className={styles.emptyState}>正在加载对局详情</p> : null}

          {selectedRecord && !isLoadingDetail ? (
            <>
              <dl className={styles.accountSummary}>
                <div>
                  <dt>规则</dt>
                  <dd>{selectedRecord.ruleName}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDateTime(selectedRecord.startedAt)}</dd>
                </div>
                <div>
                  <dt>结束时间</dt>
                  <dd>{selectedRecord.endedAt ? formatDateTime(selectedRecord.endedAt) : "-"}</dd>
                </div>
                <div>
                  <dt>总分</dt>
                  <dd>{selectedRecord.totalPoints ?? 0}</dd>
                </div>
                <div>
                  <dt>胜者</dt>
                  <dd>
                    {selectedRecord.result?.winnerSeatIndex === undefined
                      ? "-"
                      : `${selectedRecord.result.winnerSeatIndex + 1}号位`}
                  </dd>
                </div>
                <div>
                  <dt>胡牌牌</dt>
                  <dd>{selectedRecord.result?.winningTile?.label ?? selectedRecord.winningTile ?? "-"}</dd>
                </div>
              </dl>

              {selectedRecord.result ? (
                <div className={styles.resultSummary}>
                  <strong>结算明细</strong>
                  <span>{getGameHistoryResultText(selectedRecord)}</span>
                  <p>
                    番数：{selectedRecord.result.fanTotal}，总分：
                    {selectedRecord.result.totalPoints}
                  </p>
                  {selectedFanText ? <p>{selectedFanText}</p> : null}
                </div>
              ) : null}

              <section className={styles.replayPanel} aria-label="历史事件回放">
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.panelLabel}>事件回放</p>
                    <h2>{getReplayProgressText(replayIndex, replayEvents.length)}</h2>
                  </div>
                  <span className={styles.statusBadge}>
                    {isReplayPlaying ? "播放中" : "已暂停"}
                  </span>
                </div>
                {replayEvent ? (
                  <>
                    <p className={styles.replayEvent}>
                      {formatDateTime(replayEvent.createdAt)} {replayEvent.text}
                    </p>
                    {replayView ? (
                      <div className={styles.historyReplayTable}>
                        <MahjongTable
                          onAction={() => undefined}
                          onSelectTile={() => undefined}
                          selectedTileId={null}
                          view={replayView}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.emptyState}>暂无可回放事件</p>
                )}
                <div className={styles.replayControls}>
                  <button
                    className={styles.secondaryButton}
                    disabled={replayEvents.length === 0 || replayIndex === 0}
                    onClick={() =>
                      setReplayIndex((currentIndex) =>
                        getNextReplayIndex(currentIndex, replayEvents.length, "previous")
                      )
                    }
                    type="button"
                  >
                    上一条
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={replayEvents.length === 0}
                    onClick={() => setIsReplayPlaying((currentValue) => !currentValue)}
                    type="button"
                  >
                    {isReplayPlaying ? "暂停" : "播放"}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    disabled={replayEvents.length === 0 || replayIndex >= replayEvents.length - 1}
                    onClick={() =>
                      setReplayIndex((currentIndex) =>
                        getNextReplayIndex(currentIndex, replayEvents.length, "next")
                      )
                    }
                    type="button"
                  >
                    下一条
                  </button>
                </div>
              </section>

              {selectedRecord.events.length > 0 ? (
                <ol className={styles.eventList} aria-label="历史对局事件">
                  {selectedRecord.events.map((event) => (
                    <li key={event.id}>
                      {formatDateTime(event.createdAt)} {event.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.emptyState}>暂无事件记录</p>
              )}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
