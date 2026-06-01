import { beforeEach, describe, expect, it } from "vitest";

import { useGameStore } from "./gameStore.js";

describe("gameStore", () => {
  beforeEach(() => {
    useGameStore.setState({
      scenarioId: "initial",
      selectedTileId: null,
      view: useGameStore.getState().view
    });
    useGameStore.getState().setScenario("initial");
    useGameStore.getState().setSeatIndex(0);
  });

  it("switches mock scenarios and clears selected tile", () => {
    useGameStore.getState().selectTile("c1-a");

    useGameStore.getState().setScenario("actionable");

    expect(useGameStore.getState()).toMatchObject({
      scenarioId: "actionable",
      selectedTileId: null
    });
    expect(useGameStore.getState().view.availableActions.map((action) => action.type)).toEqual([
      "chi",
      "peng",
      "gang",
      "hu",
      "pass"
    ]);
  });

  it("switches player perspective without exposing other hands", () => {
    useGameStore.getState().setSeatIndex(2);

    const view = useGameStore.getState().view;

    expect(view.seatIndex).toBe(2);
    expect(view.handTiles.length).toBeGreaterThan(0);
    expect(view.otherPlayers).toHaveLength(3);
    expect(view.otherPlayers.some((player) => player.seatIndex === 2)).toBe(false);
  });

  it("toggles selected hand tile", () => {
    useGameStore.getState().selectTile("c1-a");
    expect(useGameStore.getState().selectedTileId).toBe("c1-a");

    useGameStore.getState().selectTile("c1-a");
    expect(useGameStore.getState().selectedTileId).toBeNull();
  });
});
