import type { AuthUser } from "@mahjong/shared";

import styles from "../app/App.module.css";
import { APP_ROUTES, replaceRoute } from "../app/routes.js";
import { MahjongTable } from "../components/game/MahjongTable.js";
import { gameScenarios } from "../game/mockViews.js";
import { useAuthStore } from "../stores/authStore.js";
import { useGameStore } from "../stores/gameStore.js";

type GamePageProps = {
  user: AuthUser;
};

export function GamePage(props: GamePageProps): JSX.Element {
  const signOut = useAuthStore((state) => state.signOut);
  const scenarioId = useGameStore((state) => state.scenarioId);
  const selectedTileId = useGameStore((state) => state.selectedTileId);
  const view = useGameStore((state) => state.view);
  const selectTile = useGameStore((state) => state.selectTile);
  const setScenario = useGameStore((state) => state.setScenario);
  const setSeatIndex = useGameStore((state) => state.setSeatIndex);

  const latestEvent = view.eventMessages.at(-1);

  return (
    <main className={styles.gameShell}>
      <header className={styles.lobbyHeader}>
        <div>
          <p className={styles.kicker}>在线麻将</p>
          <h1>模拟牌桌</h1>
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
              <p className={styles.panelLabel}>演示场景</p>
              <h2>牌局状态</h2>
            </div>
            <div className={styles.segmentedControls}>
              {gameScenarios.map((scenario) => (
                <button
                  className={
                    scenario.id === scenarioId ? styles.segmentButtonActive : styles.segmentButton
                  }
                  key={scenario.id}
                  onClick={() => setScenario(scenario.id)}
                  type="button"
                >
                  {scenario.label}
                </button>
              ))}
            </div>
            <p className={styles.helperText}>
              {gameScenarios.find((scenario) => scenario.id === scenarioId)?.description}
            </p>
          </section>

          <section className={styles.lobbyPanel}>
            <div>
              <p className={styles.panelLabel}>视角切换</p>
              <h2>玩家座位</h2>
            </div>
            <div className={styles.segmentedControls}>
              {[0, 1, 2, 3].map((seatIndex) => (
                <button
                  className={
                    view.seatIndex === seatIndex ? styles.segmentButtonActive : styles.segmentButton
                  }
                  key={seatIndex}
                  onClick={() => setSeatIndex(seatIndex)}
                  type="button"
                >
                  {seatIndex + 1}号位
                </button>
              ))}
            </div>
            <p className={styles.helperText}>
              当前视角只显示自己的手牌，其他玩家仅显示背面牌数量。
            </p>
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

        <MahjongTable onSelectTile={selectTile} selectedTileId={selectedTileId} view={view} />
      </section>
    </main>
  );
}
