export { chooseBasicBotAction, chooseDiscardTile } from "./bots/basicBot.js";
export { calculateShanten } from "./bots/handPotential.js";
export {
  applyAction,
  createEmptyPlayerView,
  createInitialGame,
  createPlayerView,
  getLegalActions
} from "./game.js";
export type {
  ApplyActionResult,
  CreateGameOptions,
  MahjongGameState,
  PlayerState
} from "./game.js";
export { canHu, countTiles, isSevenPairs } from "./hand.js";
export type { HuPattern, HuResult } from "./hand.js";
export {
  getRulePreset,
  getClaimPriorityConfig,
  getEnabledFans,
  getFanValues,
  getRuleConfigValidationErrors,
  getRuleTileSet,
  normalizeRuleConfig,
  sichuanRuleConfig,
  shouldEndOnEmptyWall,
  simpleRuleConfig,
  standardRuleConfig
} from "./rules.js";
export type { RuleConfig, RulePresetName } from "./rules.js";
export {
  calculateScore,
  identifyFans,
  isChinitsu,
  isHonitsu,
  isHonroutou,
  meetsMinimumFan,
  isPinfu,
  isTanyao,
  isToitoi
} from "./scoring.js";
export type { Fan, FanType, ScoreOptions, ScoreResult } from "./scoring.js";
export {
  compareTiles,
  createTile,
  getTileDefinition,
  isSameTileType,
  tileDefinitions
} from "./tiles.js";
export type { Tile, TileCode, TileDefinition } from "./tiles.js";
export { createSeededRandom, createShuffledWall, createWall, shuffleWall } from "./wall.js";
export type { RandomSource } from "./wall.js";
export { runBasicBotGame } from "./simulation.js";
export type { SimulationResult } from "./simulation.js";
