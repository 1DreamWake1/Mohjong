import type { TileInfo } from "@mahjong/shared";

import styles from "./gameComponents.module.css";

type TileProps = {
  hidden?: boolean;
  onClick?: () => void;
  selected?: boolean;
  tile?: TileInfo;
};

export function Tile(props: TileProps): JSX.Element {
  const className = [
    styles.tile,
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
      {props.hidden ? "" : props.tile?.label}
    </button>
  );
}
