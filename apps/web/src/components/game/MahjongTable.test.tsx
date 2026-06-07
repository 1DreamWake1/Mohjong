import type { Action } from "@mahjong/shared";
import { describe, expect, it } from "vitest";

import {
  getMeldTypeLabel,
  getVisibleActions,
  shouldPromptForDiscardSelection,
  shouldRenderActionBar
} from "./MahjongTable.js";

const discardActions: Action[] = [
  { tileId: "tile-a", type: "discard" },
  { tileId: "tile-b", type: "discard" }
];

describe("MahjongTable actions", () => {
  it("renders meld type labels in Chinese", () => {
    expect(getMeldTypeLabel("chi")).toBe("吃");
    expect(getMeldTypeLabel("peng")).toBe("碰");
    expect(getMeldTypeLabel("gang")).toBe("杠");
  });

  it("does not expose a discard action before a hand tile is selected", () => {
    const actions = getVisibleActions(discardActions, null);

    expect(actions).toEqual([]);
    expect(shouldPromptForDiscardSelection(discardActions, null)).toBe(true);
  });

  it("exposes the selected discard action", () => {
    const actions = getVisibleActions(discardActions, "tile-b");

    expect(actions).toEqual([{ tileId: "tile-b", type: "discard" }]);
    expect(shouldPromptForDiscardSelection(discardActions, "tile-b")).toBe(false);
  });

  it("keeps claim actions visible while waiting for a discard selection", () => {
    const actions: Action[] = [{ type: "hu" }, ...discardActions];
    const visibleActions = getVisibleActions(actions, "unknown-tile");

    expect(visibleActions).toEqual([{ type: "hu" }]);
    expect(shouldPromptForDiscardSelection(actions, "unknown-tile")).toBe(true);
    expect(shouldRenderActionBar(visibleActions, true)).toBe(true);
  });

  it("hides the empty action bar when only discard selection is pending", () => {
    expect(shouldRenderActionBar([], true)).toBe(false);
    expect(shouldRenderActionBar([], false)).toBe(true);
  });
});
