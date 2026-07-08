import styles from "./LandingPage.module.css";

const featureItems = [
  {
    index: "01",
    title: "房间即开即玩",
    copy: "创建房间、分享房间号，成员准备后即可开局。空位由机器人补齐，不让一桌人卡在等待里。"
  },
  {
    index: "02",
    title: "规则统一执行",
    copy: "服务端校验每次出牌、碰杠与胡牌，所有玩家看到同一份实时状态，规则清楚且可追溯。"
  },
  {
    index: "03",
    title: "对局记录留存",
    copy: "自动保存结果、番型与关键事件。成员可以回看历史，管理者可以统一维护玩家账号。"
  }
];

const tableTiles = ["一萬", "二萬", "三萬", "⑤", "⑤", "⑤", "三条", "四条", "五条"];

export function LandingPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="牌桌云首页">
          <span className={styles.brandMark} aria-hidden="true">
            牌
          </span>
          <span>牌桌云</span>
        </a>
        <nav className={styles.nav} aria-label="主页导航">
          <a href="#capabilities">产品能力</a>
          <a href="#workflow">开局流程</a>
          <a className={styles.loginLink} href="/login">
            登录
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true">
          <div className={styles.gamePreview}>
            <div className={styles.previewTopbar}>
              <span>好友房 · 6842</span>
              <span>牌墙 47</span>
            </div>
            <div className={styles.playerNorth}>
              <span className={styles.avatar}>林</span>
              <span>林间风 · 13 张</span>
            </div>
            <div className={styles.playerWest}>
              <span className={styles.avatar}>陈</span>
            </div>
            <div className={styles.playerEast}>
              <span className={styles.avatar}>顾</span>
            </div>
            <div className={styles.tableCenter}>
              <span>南</span>
              <strong>剩余 18 秒</strong>
            </div>
            <div className={styles.discards}>
              {tableTiles.slice(0, 6).map((tile, index) => (
                <span key={`${tile}-${index}`}>{tile}</span>
              ))}
            </div>
            <div className={styles.hand}>
              {tableTiles.map((tile, index) => (
                <span
                  className={index === tableTiles.length - 1 ? styles.drawnTile : undefined}
                  key={`${tile}-${index}`}
                >
                  {tile}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>为社群与俱乐部而建的在线牌桌</p>
          <h1>牌桌云</h1>
          <p className={styles.heroCopy}>
            把熟悉的一桌牌，放进随时可进入的线上房间。创建、开局、结算与记录，一套服务完整承接。
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="/login">
              进入牌桌
            </a>
            <a className={styles.secondaryAction} href="#capabilities">
              了解产品
            </a>
          </div>
          <div className={styles.proof} aria-label="产品特点">
            <span>
              <strong>4</strong> 人实时同步
            </span>
            <span>
              <strong>24/7</strong> 随时开房
            </span>
            <span>
              <strong>0</strong> 客户端安装
            </span>
          </div>
        </div>
      </section>

      <section className={styles.capabilities} id="capabilities">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>一桌牌所需的全部基础设施</p>
          <h2>专注对局，其他交给系统</h2>
        </div>
        <div className={styles.featureGrid}>
          {featureItems.map((item) => (
            <article className={styles.feature} key={item.index}>
              <span>{item.index}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflow} id="workflow">
        <div className={styles.workflowCopy}>
          <p className={styles.eyebrow}>从邀请到开局，只要三步</p>
          <h2>今天的牌局，不必等所有人都到齐</h2>
          <p>
            一个人可以立即与机器人练手，多人房间可以分享房间号邀请牌友。成员临时离开时，机器人可继续接手当前牌局。
          </p>
          <a href="/login">创建第一间房</a>
        </div>
        <ol className={styles.steps}>
          <li>
            <strong>创建</strong>
            <span>登录并创建专属房间</span>
          </li>
          <li>
            <strong>邀请</strong>
            <span>把四位房间号发给牌友</span>
          </li>
          <li>
            <strong>开局</strong>
            <span>准备完成，实时对局</span>
          </li>
        </ol>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p className={styles.eyebrow}>下一桌，线上见</p>
          <h2>房间已经准备好</h2>
        </div>
        <a href="/login">登录并开始</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/">
          <span className={styles.brandMark} aria-hidden="true">
            牌
          </span>
          <span>牌桌云</span>
        </a>
        <p>在线麻将房间与对局管理</p>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
