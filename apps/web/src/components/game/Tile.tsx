import type { TileInfo } from "@mahjong/shared";

import styles from "./gameComponents.module.css";

type TileProps = {
  hidden?: boolean;
  onClick?: () => void;
  selected?: boolean;
  tile?: TileInfo;
};

const suitLabels: Record<TileInfo["suit"], string> = {
  bamboo: "条",
  characters: "万",
  dots: "筒",
  dragons: "箭",
  winds: "风"
};

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

  return (
    <span className={styles.tileFace}>
      <span className={styles.tileMark}>{pattern ?? tile.label}</span>
      <span className={styles.tileCaption}>{suitLabels[tile.suit]}</span>
    </span>
  );
}

export function Tile(props: TileProps): JSX.Element {
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
      aria-label={props.hidden ? "背面牌" : props.tile?.label}
      className={className}
      disabled={props.hidden || !props.onClick}
      onClick={props.onClick}
      type="button"
    >
      {props.hidden || !props.tile ? "" : renderTileFace(props.tile)}
    </button>
  );
}
