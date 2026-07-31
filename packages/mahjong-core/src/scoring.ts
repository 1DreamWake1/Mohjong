import { canHu, countTiles, isSevenPairs } from "./hand.js";
import {
  allowsSevenPairs,
  getEnabledFans,
  getFanValues,
  getScoringConfig,
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
  | "honroutou";

export type Fan = {
  type: FanType;
  name: string;
  value: number;
};

export type ScoreOptions = {
  isRiichi?: boolean;
  basePoints?: number;
  fanPointValue?: number;
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
  honroutou: { type: "honroutou", name: "混老头" }
};

export function calculateScore(
  tiles: readonly Tile[],
  rules: RuleConfig,
  options: ScoreOptions = {}
): ScoreResult {
  const scoring = getScoringConfig(rules);
  if (!canHu(tiles, rules).canHu) {
    return {
      canHu: false,
      fans: [],
      fanTotal: 0,
      basePoints: options.basePoints ?? scoring.basePoints,
      totalPoints: 0
    };
  }

  const fans = identifyFans(tiles, rules, options);
  const fanTotal = fans.reduce((total, fan) => total + fan.value, 0);
  const basePoints = options.basePoints ?? scoring.basePoints;
  const fanPointValue = options.fanPointValue ?? scoring.fanPointValue;

  return {
    canHu: true,
    fans,
    fanTotal,
    basePoints,
    totalPoints: basePoints + fanTotal * fanPointValue
  };
}

export function identifyFans(
  tiles: readonly Tile[],
  rules: RuleConfig,
  options: ScoreOptions = {}
): Fan[] {
  if (!canHu(tiles, rules).canHu) {
    return [];
  }

  const fanTypes: FanType[] = [];
  const counts = countTiles(tiles);
  const enabledFans = getEnabledFans(rules);
  const fanValues = getFanValues(rules);

  if (enabledFans.pinfu && isPinfu(tiles)) {
    fanTypes.push("pinfu");
  }

  if (enabledFans.riichi && options.isRiichi) {
    fanTypes.push("riichi");
  }

  if (enabledFans.tanyao && isTanyao(tiles)) {
    fanTypes.push("tanyao");
  }

  if (enabledFans.chinitsu && isChinitsu(tiles)) {
    fanTypes.push("chinitsu");
  } else if (enabledFans.honitsu && isHonitsu(tiles)) {
    fanTypes.push("honitsu");
  }

  if (enabledFans.toitoi && isToitoi(counts)) {
    fanTypes.push("toitoi");
  }

  if (enabledFans.sevenPairs && allowsSevenPairs(rules) && isSevenPairs(counts)) {
    fanTypes.push("sevenPairs");
  }

  if (enabledFans.honroutou && isHonroutou(tiles)) {
    fanTypes.push("honroutou");
  }

  return fanTypes.map((type) => ({ ...fanDefinitions[type], value: fanValues[type] }));
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
