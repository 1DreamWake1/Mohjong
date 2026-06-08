import type { Action, MeldType, PlayerView } from "@mahjong/shared";

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

export function shouldPromptForDiscardSelection(actions: Action[], selectedTileId: string | null): boolean {
  return (
    actions.some((action) => action.type === "discard") &&
    !getVisibleActions(actions, selectedTileId).some((action) => action.type === "discard")
  );
}

export function shouldRenderActionBar(visibleActions: Action[], promptForDiscardSelection: boolean): boolean {
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
              <span>{seatNames[player.seatIndex]}</span>
            </div>
            <div className={styles.hiddenHand}>
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
          <span>{seatNames[props.view.seatIndex]}位视角</span>
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
