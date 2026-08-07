import type { MeldInfo } from "@mahjong/shared";

import { canHu, countTiles, isSevenPairs } from "./hand.js";
import {
  allowsSevenPairs,
  getEnabledFans,
  getFanValues,
  getScoringConfig,
  getSichuanRuleOptions,
  type RuleConfig
} from "./rules.js";
import { getTileDefinition, isSuited, tileDefinitions, type Tile, type TileCode } from "./tiles.js";

export type FanType =
  | "pinfu"
  | "riichi"
  | "tanyao"
  | "honitsu"
  | "chinitsu"
  | "toitoi"
  | "sevenPairs"
  | "honroutou"
  | "root";

export type Fan = {
  type: FanType;
  name: string;
  value: number;
};

export type ScoreOptions = {
  isRiichi?: boolean;
  basePoints?: number;
  fanPointValue?: number;
  publicMelds?: readonly MeldInfo[];
};

export type ScoreResult = {
  canHu: boolean;
  fans: Fan[];
  fanTotal: number;
  basePoints: number;
  totalPoints: number;
};

const fanDefinitions: Record<FanType, Omit<Fan, "value">> = {
  pinfu: { type: "pinfu", name: "平和" },
  riichi: { type: "riichi", name: "立直" },
  tanyao: { type: "tanyao", name: "断幺九" },
  honitsu: { type: "honitsu", name: "混一色" },
  chinitsu: { type: "chinitsu", name: "清一色" },
  toitoi: { type: "toitoi", name: "对对胡" },
  sevenPairs: { type: "sevenPairs", name: "七对子" },
  honroutou: { type: "honroutou", name: "混老头" },
  root: { type: "root", name: "根" }
};

export function calculateScore(
  tiles: readonly Tile[],
  rules: RuleConfig,
  options: ScoreOptions = {}
): ScoreResult {
  const scoring = getScoringConfig(rules);
  const openMeldCount = options.publicMelds?.length ?? 0;
  if (!canHu(tiles, rules, openMeldCount).canHu) {
    return {
      canHu: false,
      fans: [],
      fanTotal: 0,
      basePoints: options.basePoints ?? scoring.basePoints,
      totalPoints: 0
    };
  }

  const fans = identifyFans(tiles, rules, options);
  const rootTotal = fans
    .filter((fan) => fan.type === "root")
    .reduce((total, fan) => total + fan.value, 0);
  const fanTotal = fans.reduce((total, fan) => total + fan.value, 0);
  const minimumEligibleFanTotal = fanTotal - rootTotal;
  const basePoints = options.basePoints ?? scoring.basePoints;
  const fanPointValue = options.fanPointValue ?? scoring.fanPointValue;
  const appliedFanTotal =
    scoring.fanLimit === null
      ? minimumEligibleFanTotal
      : Math.min(minimumEligibleFanTotal, Math.max(0, scoring.fanLimit));
  const totalPoints =
    scoring.mode === "sichuan"
      ? basePoints * 2 ** (appliedFanTotal + rootTotal)
      : basePoints + appliedFanTotal * fanPointValue;

  return {
    canHu: true,
    fans,
    fanTotal,
    basePoints,
    totalPoints
  };
}

export function identifyFans(
  tiles: readonly Tile[],
  rules: RuleConfig,
  options: ScoreOptions = {}
): Fan[] {
  const publicMelds = options.publicMelds ?? [];
  if (!canHu(tiles, rules, publicMelds.length).canHu) {
    return [];
  }

  const fanTypes: FanType[] = [];
  const completeTiles = [...tiles, ...publicMelds.flatMap((meld) => meld.tiles as Tile[])];
  const counts = countTiles(completeTiles);
  const enabledFans = getEnabledFans(rules);
  const fanValues = getFanValues(rules);

  if (enabledFans.pinfu && publicMelds.every((meld) => meld.type === "chi") && isPinfu(tiles)) {
    fanTypes.push("pinfu");
  }

  if (enabledFans.riichi && options.isRiichi) {
    fanTypes.push("riichi");
  }

  if (enabledFans.tanyao && isTanyao(completeTiles)) {
    fanTypes.push("tanyao");
  }

  if (enabledFans.chinitsu && isChinitsu(completeTiles)) {
    fanTypes.push("chinitsu");
  } else if (enabledFans.honitsu && isHonitsu(completeTiles)) {
    fanTypes.push("honitsu");
  }

  if (enabledFans.toitoi && isToitoi(counts)) {
    fanTypes.push("toitoi");
  }

  if (
    enabledFans.sevenPairs &&
    publicMelds.length === 0 &&
    allowsSevenPairs(rules) &&
    isSevenPairs(counts)
  ) {
    fanTypes.push("sevenPairs");
  }

  if (enabledFans.honroutou && isHonroutou(completeTiles)) {
    fanTypes.push("honroutou");
  }

  const rootOptions = rules.name.startsWith("sichuan")
    ? getSichuanRuleOptions(rules).root
    : undefined;
  const rootValue = rootOptions?.fanValue ?? getFanValues(rules).root ?? 0;
  if (
    enabledFans.root &&
    rootOptions?.enabled !== false &&
    rootValue > 0 &&
    rules.name.startsWith("sichuan")
  ) {
    const rootCount = [...counts.values()].filter((count) => count === 4).length;
    if (rootCount > 0) fanTypes.push("root");
  }

  return fanTypes.map((type) => ({
    ...fanDefinitions[type],
    value:
      type === "root"
        ? rootValue * [...counts.values()].filter((count) => count === 4).length
        : (fanValues[type] ?? 0)
  }));
}

export function meetsMinimumFan(score: ScoreResult, rules: RuleConfig): boolean {
  if (!score.canHu) return false;

  const rootTotal = score.fans
    .filter((fan) => fan.type === "root")
    .reduce((total, fan) => total + fan.value, 0);
  return score.fanTotal - rootTotal >= getScoringConfig(rules).minimumFan;
}

export function isTanyao(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => isSimpleTile(tile.code));
}

export function isChinitsu(tiles: readonly Tile[]): boolean {
  const suits = new Set(tiles.map((tile) => tile.suit));

  return suits.size === 1 && isSuited(tiles[0] ?? getTileDefinition("m1"));
}

export function isHonitsu(tiles: readonly Tile[]): boolean {
  const suitedSuits = new Set(tiles.filter(isSuited).map((tile) => tile.suit));
  const hasHonor = tiles.some((tile) => !isSuited(tile));

  return suitedSuits.size === 1 && hasHonor;
}

export function isToitoi(counts: ReadonlyMap<TileCode, number>): boolean {
  let pairCount = 0;
  let tripletCount = 0;

  for (const count of counts.values()) {
    if (count === 2) {
      pairCount += 1;
    } else if (count === 3 || count === 4) {
      tripletCount += 1;
    } else {
      return false;
    }
  }

  return pairCount === 1 && tripletCount === 4;
}

export function isHonroutou(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => !isSimpleTile(tile.code));
}

export function isPinfu(tiles: readonly Tile[]): boolean {
  const counts = countTiles(tiles);

  for (const [code, count] of counts) {
    if (count !== 2) {
      continue;
    }

    const remaining = new Map(counts);
    addCount(remaining, code, -2);

    if (canMakeAllSequences(remaining)) {
      return true;
    }
  }

  return false;
}

function canMakeAllSequences(counts: Map<TileCode, number>): boolean {
  const nextCode = firstRemainingCode(counts);

  if (!nextCode) {
    return true;
  }

  const sequence = getSequence(nextCode);

  if (!sequence || !sequence.every((code) => (counts.get(code) ?? 0) > 0)) {
    return false;
  }

  for (const code of sequence) {
    addCount(counts, code, -1);
  }

  return canMakeAllSequences(counts);
}

function isSimpleTile(code: TileCode): boolean {
  const definition = getTileDefinition(code);

  return isSuited(definition) && definition.rank >= 2 && definition.rank <= 8;
}

function firstRemainingCode(counts: ReadonlyMap<TileCode, number>): TileCode | undefined {
  return tileDefinitions.find((definition) => (counts.get(definition.code) ?? 0) > 0)?.code;
}

function getSequence(code: TileCode): [TileCode, TileCode, TileCode] | undefined {
  const definition = getTileDefinition(code);

  if (!isSuited(definition) || definition.rank > 7) {
    return undefined;
  }

  const prefix = code[0];

  return [
    code,
    `${prefix}${definition.rank + 1}` as TileCode,
    `${prefix}${definition.rank + 2}` as TileCode
  ];
}

function addCount(counts: Map<TileCode, number>, code: TileCode, delta: number): void {
  const nextCount = (counts.get(code) ?? 0) + delta;

  if (nextCount <= 0) {
    counts.delete(code);
    return;
  }

  counts.set(code, nextCount);
}
