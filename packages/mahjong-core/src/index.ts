import type { PlayerView } from "@mahjong/shared";

export type RuleConfig = {
  name: string;
  allowChi: boolean;
  allowPeng: boolean;
  allowGang: boolean;
  allowSevenPairs: boolean;
  useWinds: boolean;
  useDragons: boolean;
  scoringMode: "standard" | "sichuan";
};

export const standardRuleConfig: RuleConfig = {
  name: "standard",
  allowChi: true,
  allowPeng: true,
  allowGang: true,
  allowSevenPairs: true,
  useWinds: true,
  useDragons: true,
  scoringMode: "standard"
};

export function createEmptyPlayerView(seatIndex: number): PlayerView {
  return {
    seatIndex,
    handTiles: [],
    otherPlayers: [],
    discardAreas: [],
    publicMelds: [],
    currentTurn: 0,
    availableActions: [],
    phase: "waiting"
  };
}
