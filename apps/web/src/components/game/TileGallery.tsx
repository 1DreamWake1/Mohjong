import { tileCatalogGroups } from "../../game/tileCatalog.js";
import styles from "./gameComponents.module.css";
import { getTileDisplayLabel, Tile } from "./Tile.js";

export function TileGallery(): JSX.Element {
  return (
    <div className={styles.tileGallery}>
      {tileCatalogGroups.map((group) => (
        <section className={styles.tileGalleryGroup} key={group.id}>
          <div className={styles.tileGalleryHeader}>
            <h3>{group.label}</h3>
            <span>{group.tiles.length} 种</span>
          </div>
          <div className={styles.tileGalleryTiles}>
            {group.tiles.map((tile) => (
              <div className={styles.tileGalleryItem} key={tile.id}>
                <Tile tile={tile} />
                <span
                  className={styles.tileGalleryLabel}
                  data-rank={tile.rank}
                  data-suit={tile.suit}
                >
                  {getTileDisplayLabel(tile)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
