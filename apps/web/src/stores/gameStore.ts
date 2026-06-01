import type { PlayerView } from "@mahjong/shared";
import { create } from "zustand";

import { getScenarioById, type GameScenarioId } from "../game/mockViews.js";

type GameStore = {
  scenarioId: GameScenarioId;
  selectedTileId: string | null;
  view: PlayerView;
  setScenario: (scenarioId: GameScenarioId) => void;
  setSeatIndex: (seatIndex: number) => void;
  selectTile: (tileId: string) => void;
};

const defaultScenario = getScenarioById("initial");

function getView(scenarioId: GameScenarioId, seatIndex: number): PlayerView {
  const scenario = getScenarioById(scenarioId);
  const view = scenario.views.find((item) => item.seatIndex === seatIndex);
  if (view) {
    return view;
  }

  const fallback = scenario.views[0];
  if (!fallback) {
    throw new Error(`No views configured for scenario ${scenarioId}`);
  }

  return fallback;
}

export const useGameStore = create<GameStore>((set, get) => ({
  scenarioId: defaultScenario.id,
  selectedTileId: null,
  view: getView(defaultScenario.id, 0),

  selectTile: (tileId) => {
    set((state) => ({
      selectedTileId: state.selectedTileId === tileId ? null : tileId
    }));
  },

  setScenario: (scenarioId) => {
    const currentSeatIndex = get().view.seatIndex;
    set({
      scenarioId,
      selectedTileId: null,
      view: getView(scenarioId, currentSeatIndex)
    });
  },

  setSeatIndex: (seatIndex) => {
    set((state) => ({
      selectedTileId: null,
      view: getView(state.scenarioId, seatIndex)
    }));
  }
}));
