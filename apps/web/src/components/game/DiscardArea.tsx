import type { DiscardPile } from "@mahjong/shared";

import styles from "./gameComponents.module.css";
import { Tile } from "./Tile.js";

type DiscardAreaProps = {
  pile: DiscardPile;
};

export function DiscardArea(props: DiscardAreaProps): JSX.Element {
  return (
    <div className={styles.discardArea}>
      {props.pile.tiles.map((tile) => (
        <Tile key={tile.id} tile={tile} />
      ))}
    </div>
  );
}
