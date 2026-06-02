import type { Action } from "@mahjong/shared";

import styles from "./gameComponents.module.css";

const actionLabels: Record<Action["type"], string> = {
  chi: "吃",
  discard: "打出",
  gang: "杠",
  hu: "胡",
  pass: "过",
  peng: "碰"
};

type ActionBarProps = {
  actions: Action[];
  disabled?: boolean;
  onAction?: (action: Action) => void;
};

export function ActionBar(props: ActionBarProps): JSX.Element {
  if (props.actions.length === 0) {
    return <p className={styles.actionHint}>当前没有可执行操作</p>;
  }

  return (
    <div className={styles.actionBar}>
      {props.actions.map((action, index) => (
        <button
          className={action.type === "hu" ? styles.winButton : styles.actionButton}
          disabled={props.disabled}
          key={`${action.type}-${action.tileId ?? index}`}
          onClick={() => props.onAction?.(action)}
          type="button"
        >
          {actionLabels[action.type]}
        </button>
      ))}
    </div>
  );
}
