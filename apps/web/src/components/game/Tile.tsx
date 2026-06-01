import type { TileInfo } from "@mahjong/shared";

import styles from "./gameComponents.module.css";

type TileProps = {
  hidden?: boolean;
  onClick?: () => void;
  selected?: boolean;
  tile?: TileInfo;
};

const characterRankLabels = ["", "一", "二", "三", "四", "伍", "六", "七", "八", "九"];

export function getTileDisplayLabel(tile: TileInfo): string {
  if (tile.suit === "characters") {
    return `${characterRankLabels[tile.rank] ?? tile.rank}萬`;
  }

  if (tile.suit === "dragons" && tile.rank === 2) {
    return "發";
  }

  return tile.label;
}

function requiredClass(className: string | undefined, name: string): string {
  if (!className) {
    throw new Error(`Missing CSS module class: ${name}`);
  }

  return className;
}

function getSuitClassName(suit: TileInfo["suit"]): string {
  switch (suit) {
    case "bamboo":
      return requiredClass(styles.tileBamboo, "tileBamboo");
    case "characters":
      return requiredClass(styles.tileCharacters, "tileCharacters");
    case "dots":
      return requiredClass(styles.tileDots, "tileDots");
    case "dragons":
      return requiredClass(styles.tileDragons, "tileDragons");
    case "winds":
      return requiredClass(styles.tileWinds, "tileWinds");
  }
}

function renderPattern(tile: TileInfo): JSX.Element | null {
  if (tile.suit === "characters") {
    return (
      <span className={styles.characterPattern} aria-hidden="true">
        <span className={styles.characterRank}>{characterRankLabels[tile.rank] ?? tile.rank}</span>
        <span className={styles.characterWan}>萬</span>
      </span>
    );
  }

  if (tile.suit === "dots") {
    return (
      <span className={styles.dotPattern} aria-hidden="true">
        {Array.from({ length: tile.rank }).map((_, index) => (
          <span key={index} />
        ))}
      </span>
    );
  }

  if (tile.suit === "bamboo") {
    return (
      <span className={styles.bambooPattern} aria-hidden="true">
        {Array.from({ length: tile.rank }).map((_, index) => (
          <span key={index} />
        ))}
      </span>
    );
  }

  return null;
}

function renderTileFace(tile: TileInfo): JSX.Element {
  const pattern = renderPattern(tile);
  const label = getTileDisplayLabel(tile);

  return (
    <span className={styles.tileFace}>
      <span className={styles.tileMark}>{pattern ?? label}</span>
    </span>
  );
}

export function Tile(props: TileProps): JSX.Element {
  const isInteractive = !props.hidden && Boolean(props.onClick);
  const className = [
    styles.tile,
    props.tile && !props.hidden ? getSuitClassName(props.tile.suit) : "",
    props.hidden ? styles.tileHidden : "",
    props.selected ? styles.tileSelected : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-disabled={!isInteractive}
      aria-label={props.hidden || !props.tile ? "背面牌" : getTileDisplayLabel(props.tile)}
      className={className}
      data-rank={props.hidden ? undefined : props.tile?.rank}
      data-suit={props.hidden ? undefined : props.tile?.suit}
      disabled={props.hidden}
      onClick={props.onClick}
      tabIndex={isInteractive ? undefined : -1}
      type="button"
    >
      {props.hidden || !props.tile ? "" : renderTileFace(props.tile)}
    </button>
  );
}
