import type { PlayerView } from "@mahjong/shared";

import styles from "./App.module.css";

const initialView: PlayerView = {
  seatIndex: 0,
  handTiles: [],
  otherPlayers: [],
  discardAreas: [],
  publicMelds: [],
  currentTurn: 0,
  availableActions: [],
  phase: "waiting"
};

export function App(): JSX.Element {
  return (
    <main className={styles.shell}>
      <section className={styles.panel}>
        <p className={styles.kicker}>在线麻将</p>
        <h1>项目脚手架已就绪</h1>
        <p>当前阶段是 monorepo、共享类型、服务端、前端和 Prisma 基础配置。</p>
        <dl className={styles.statusList}>
          <div>
            <dt>当前座位</dt>
            <dd>{initialView.seatIndex}</dd>
          </div>
          <div>
            <dt>牌局阶段</dt>
            <dd>{initialView.phase}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
