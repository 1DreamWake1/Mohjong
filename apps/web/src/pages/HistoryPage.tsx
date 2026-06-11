import type { AuthUser, GameHistoryDetail, GameHistoryItem } from "@mahjong/shared";
import { useEffect, useMemo, useState } from "react";

import { getGameHistory, listGameHistory } from "../api/client.js";
import { getErrorMessage, isUnauthorizedError } from "../api/errors.js";
import styles from "../app/App.module.css";
import { APP_ROUTES, replaceRoute } from "../app/routes.js";
import { useAuthStore } from "../stores/authStore.js";
import { formatDateTime } from "../utils/date.js";

type HistoryPageProps = {
  token: string;
  user: AuthUser;
};

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

export function HistoryPage(props: HistoryPageProps): JSX.Element {
  const clearSession = useAuthStore((state) => state.clearSession);
  const signOut = useAuthStore((state) => state.signOut);
  const [records, setRecords] = useState<GameHistoryItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<GameHistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const sortedRecords = useMemo(() => sortGameHistory(records), [records]);

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
              <p>{records.length} 条记录</p>
            </div>
            <button
              className={styles.secondaryButton}
              disabled={isLoadingList}
              onClick={() => void refreshHistory()}
              type="button"
            >
              {isLoadingList ? "刷新中" : "刷新"}
            </button>
          </div>

          {isLoadingList ? (
            <p className={styles.emptyState}>正在加载历史对局</p>
          ) : sortedRecords.length === 0 ? (
            <p className={styles.emptyState}>暂无历史对局</p>
          ) : (
            <div className={styles.playerList}>
              {sortedRecords.map((record) => (
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
              </dl>

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
