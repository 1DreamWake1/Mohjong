import type { PlayerView } from "@mahjong/shared";
import { create } from "zustand";

import { getScenarioById, type GameScenarioId } from "../game/mockViews.js";

type GameStore = {
  errorMessage: string | null;
  scenarioId: GameScenarioId;
  selectedTileId: string | null;
  status: "idle" | "joining" | "active" | "ended";
  view: PlayerView;
  clearError: () => void;
  resetLiveGame: () => void;
  setScenario: (scenarioId: GameScenarioId) => void;
  setSeatIndex: (seatIndex: number) => void;
  setStatus: (status: GameStore["status"]) => void;
  setErrorMessage: (message: string | null) => void;
  setView: (view: PlayerView) => void;
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
  errorMessage: null,
  scenarioId: defaultScenario.id,
  selectedTileId: null,
  status: "idle",
  view: getView(defaultScenario.id, 0),

  clearError: () => {
    set({ errorMessage: null });
  },

  resetLiveGame: () => {
    set({
      errorMessage: null,
      selectedTileId: null,
      status: "idle",
      view: getView(defaultScenario.id, 0)
    });
  },

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

  setErrorMessage: (message) => {
    set({ errorMessage: message });
  },

  setSeatIndex: (seatIndex) => {
    set((state) => ({
      selectedTileId: null,
      view: getView(state.scenarioId, seatIndex)
    }));
  },

  setStatus: (status) => {
    set({ status });
  },

  setView: (view) => {
    set({
      errorMessage: null,
      selectedTileId: null,
      status: view.phase === "ended" ? "ended" : "active",
      view
    });
  }
}));
