import type { Action, MeldType, PlayerView } from "@mahjong/shared";
import { useEffect, useState } from "react";

import styles from "./gameComponents.module.css";
import { ActionBar } from "./ActionBar.js";
import { DiscardArea } from "./DiscardArea.js";
import { HandTiles } from "./HandTiles.js";
import { Tile } from "./Tile.js";

type MahjongTableProps = {
  selectedTileId: string | null;
  view: PlayerView;
  onAction: (action: Action) => void;
  onSelectTile: (tileId: string) => void;
};

const seatNames = ["东", "南", "西", "北"];
const meldTypeLabels: Record<MeldType, string> = {
  chi: "吃",
  gang: "杠",
  peng: "碰"
};

export function getMeldTypeLabel(type: MeldType): string {
  return meldTypeLabels[type];
}

export function getHandTileCountLabel(count: number): string {
  return `${count} 张`;
}

export function getRemainingTurnSeconds(deadlineAt: string, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(deadlineAt) - nowMs) / 1000));
}

function PlayerTurnTimer(props: {
  active: boolean;
  isBot: boolean;
  timer: PlayerView["turnTimer"];
}): JSX.Element {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!props.active || props.timer?.mode !== "countdown") {
      return;
    }

    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [props.active, props.timer]);

  let text = "等待";
  if (props.active && props.isBot) {
    text = "思考中";
  } else if (props.active && props.timer?.mode === "unlimited") {
    text = "不限时";
  } else if (props.active && props.timer?.mode === "countdown") {
    text = `${getRemainingTurnSeconds(props.timer.deadlineAt, nowMs)} 秒`;
  }

  return (
    <span
      aria-label={`操作时间 ${text}`}
      className={props.active ? styles.turnTimerActive : styles.turnTimer}
    >
      <small>计时</small>
      <span>{text}</span>
    </span>
  );
}

function HandTileCount(props: { count: number }): JSX.Element {
  const label = `当前手牌 ${getHandTileCountLabel(props.count)}`;
  return (
    <span aria-label={label} className={styles.handTileCount} title={label}>
      <span aria-hidden="true" className={styles.handTileCountIcon}>
        <i />
        <i />
        <i />
      </span>
      <strong>{props.count}</strong>
      <small>张</small>
    </span>
  );
}

export function getVisibleActions(actions: Action[], selectedTileId: string | null): Action[] {
  const discardActions = actions.filter((action) => action.type === "discard");
  const selectedDiscardAction = selectedTileId
    ? discardActions.find((action) => action.tileId === selectedTileId)
    : undefined;

  return [
    ...actions.filter((action) => action.type !== "discard"),
    ...(selectedDiscardAction ? [selectedDiscardAction] : [])
  ];
}

export function shouldPromptForDiscardSelection(
  actions: Action[],
  selectedTileId: string | null
): boolean {
  return (
    actions.some((action) => action.type === "discard") &&
    !getVisibleActions(actions, selectedTileId).some((action) => action.type === "discard")
  );
}

export function shouldRenderActionBar(
  visibleActions: Action[],
  promptForDiscardSelection: boolean
): boolean {
  return visibleActions.length > 0 || !promptForDiscardSelection;
}

export function MahjongTable(props: MahjongTableProps): JSX.Element {
  const currentPlayerName =
    props.view.currentTurn === props.view.seatIndex
      ? props.view.username
      : props.view.otherPlayers.find((player) => player.seatIndex === props.view.currentTurn)
          ?.username;

  const visibleActions = getVisibleActions(props.view.availableActions, props.selectedTileId);
  const promptForDiscardSelection = shouldPromptForDiscardSelection(
    props.view.availableActions,
    props.selectedTileId
  );

  return (
    <section className={styles.tableSurface}>
      <header className={styles.tableStatus}>
        <div>
          <p>房间 {props.view.roomId}</p>
          <h2>{props.view.phase === "ended" ? "牌局已结束" : "牌局进行中"}</h2>
        </div>
        <div className={styles.statusItems}>
          <span>牌墙 {props.view.wallTileCount}</span>
          <span>当前 {currentPlayerName ?? "未知"}</span>
        </div>
      </header>

      <div className={styles.playersGrid}>
        {props.view.otherPlayers.map((player) => (
          <article
            className={
              player.seatIndex === props.view.currentTurn ? styles.activePlayer : styles.playerPanel
            }
            key={player.seatIndex}
          >
            <div className={styles.playerTitle}>
              <strong>{player.username}</strong>
              <div className={styles.playerMeta}>
                <span className={styles.seatBadge}>{seatNames[player.seatIndex]}</span>
                <HandTileCount count={player.handTileCount} />
                <PlayerTurnTimer
                  active={player.seatIndex === props.view.currentTurn}
                  isBot={player.isBot}
                  timer={props.view.turnTimer}
                />
              </div>
            </div>
            <div
              aria-label={`${player.username}${getHandTileCountLabel(player.handTileCount)}手牌`}
              className={styles.hiddenHand}
            >
              {Array.from({ length: player.handTileCount }).map((_, index) => (
                <Tile hidden key={`${player.seatIndex}-${index}`} />
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className={styles.centerArea}>
        {props.view.discardAreas.map((pile) => (
          <section className={styles.discardPanel} key={pile.seatIndex}>
            <h3>{seatNames[pile.seatIndex]}位弃牌</h3>
            <DiscardArea
              pile={pile}
              {...(props.view.lastDiscardedTileId
                ? { highlightedTileId: props.view.lastDiscardedTileId }
                : {})}
            />
          </section>
        ))}
      </div>

      <section className={styles.meldPanel}>
        <h3>公开组合</h3>
        <div className={styles.meldList}>
          {props.view.publicMelds.map((meld, index) => (
            <div className={styles.meld} key={`${meld.ownerSeatIndex}-${index}`}>
              <span>
                {seatNames[meld.ownerSeatIndex]}位 {getMeldTypeLabel(meld.type)}
              </span>
              <div>
                {meld.tiles.map((tile) => (
                  <Tile key={tile.id} tile={tile} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.playerHandPanel}>
        <div className={styles.playerTitle}>
          <strong>{props.view.username}</strong>
          <div className={styles.playerMeta}>
            <span className={styles.seatBadge}>{seatNames[props.view.seatIndex]}位视角</span>
            <HandTileCount count={props.view.handTiles.length} />
            <PlayerTurnTimer
              active={props.view.seatIndex === props.view.currentTurn}
              isBot={false}
              timer={props.view.turnTimer}
            />
          </div>
        </div>
        <HandTiles
          onSelectTile={props.onSelectTile}
          selectedTileId={props.selectedTileId}
          tiles={props.view.handTiles}
          {...(props.view.lastDrawnTileId ? { highlightedTileId: props.view.lastDrawnTileId } : {})}
        />
        {shouldRenderActionBar(visibleActions, promptForDiscardSelection) ? (
          <ActionBar
            actions={visibleActions}
            disabled={props.view.phase === "ended"}
            onAction={props.onAction}
          />
        ) : null}
        {promptForDiscardSelection ? <p className={styles.actionHint}>请选择一张手牌打出</p> : null}
      </footer>
    </section>
  );
}
