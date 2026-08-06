import type { TileInfo } from "@mahjong/shared";

import styles from "./gameComponents.module.css";
import { Tile } from "./Tile.js";

type HandTilesProps = {
  highlightedTileId?: string;
  selectedTileId: string | null;
  selectedTileIds?: readonly string[];
  tiles: TileInfo[];
  onSelectTile: (tileId: string) => void;
};

export function HandTiles(props: HandTilesProps): JSX.Element {
  return (
    <div className={styles.handTiles}>
      {props.tiles.map((tile) => (
        <Tile
          highlighted={props.highlightedTileId === tile.id}
          key={tile.id}
          onClick={() => props.onSelectTile(tile.id)}
          selected={
            props.selectedTileId === tile.id || Boolean(props.selectedTileIds?.includes(tile.id))
          }
          tile={tile}
        />
      ))}
    </div>
  );
}
