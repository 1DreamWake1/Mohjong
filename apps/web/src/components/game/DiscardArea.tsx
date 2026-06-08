import type { DiscardPile } from "@mahjong/shared";

import styles from "./gameComponents.module.css";
import { Tile } from "./Tile.js";

type DiscardAreaProps = {
  highlightedTileId?: string;
  pile: DiscardPile;
};

export function DiscardArea(props: DiscardAreaProps): JSX.Element {
  return (
    <div className={styles.discardArea}>
      {props.pile.tiles.map((tile) => (
        <Tile highlighted={props.highlightedTileId === tile.id} key={tile.id} tile={tile} />
      ))}
    </div>
  );
}
