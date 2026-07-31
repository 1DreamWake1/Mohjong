import { allowsSevenPairs, type RuleConfig } from "./rules.js";
import { getTileDefinition, isSuited, tileDefinitions, type Tile, type TileCode } from "./tiles.js";

export type HuPattern = "standard" | "sevenPairs";

export type HuResult = {
  canHu: boolean;
  pattern?: HuPattern;
};

export function countTiles(tiles: readonly Tile[]): Map<TileCode, number> {
  const counts = new Map<TileCode, number>();

  for (const tile of tiles) {
    counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  }

  return counts;
}

export function canHu(tiles: readonly Tile[], rules: RuleConfig, openMeldCount = 0): HuResult {
  if (
    !Number.isInteger(openMeldCount) ||
    openMeldCount < 0 ||
    openMeldCount > 4 ||
    tiles.length !== 14 - openMeldCount * 3
  ) {
    return { canHu: false };
  }

  const counts = countTiles(tiles);

  if (openMeldCount === 0 && allowsSevenPairs(rules) && isSevenPairs(counts)) {
    return { canHu: true, pattern: "sevenPairs" };
  }

  if (canMakeStandardHand(counts)) {
    return { canHu: true, pattern: "standard" };
  }

  return { canHu: false };
}

export function isSevenPairs(counts: ReadonlyMap<TileCode, number>): boolean {
  let pairCount = 0;

  for (const count of counts.values()) {
    if (count === 2) {
      pairCount += 1;
      continue;
    }

    return false;
  }

  return pairCount === 7;
}

function canMakeStandardHand(counts: ReadonlyMap<TileCode, number>): boolean {
  for (const [code, count] of counts) {
    if (count < 2) {
      continue;
    }

    const remaining = cloneCounts(counts);
    addCount(remaining, code, -2);

    if (canMakeAllMelds(remaining)) {
      return true;
    }
  }

  return false;
}

function canMakeAllMelds(counts: Map<TileCode, number>): boolean {
  const nextCode = firstRemainingCode(counts);

  if (!nextCode) {
    return true;
  }

  const count = counts.get(nextCode) ?? 0;

  if (count >= 3) {
    addCount(counts, nextCode, -3);

    if (canMakeAllMelds(counts)) {
      addCount(counts, nextCode, 3);
      return true;
    }

    addCount(counts, nextCode, 3);
  }

  const sequence = getSequence(nextCode);

  if (sequence && sequence.every((code) => (counts.get(code) ?? 0) > 0)) {
    for (const code of sequence) {
      addCount(counts, code, -1);
    }

    if (canMakeAllMelds(counts)) {
      for (const code of sequence) {
        addCount(counts, code, 1);
      }

      return true;
    }

    for (const code of sequence) {
      addCount(counts, code, 1);
    }
  }

  return false;
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
  const nextCode = `${prefix}${definition.rank + 1}` as TileCode;
  const thirdCode = `${prefix}${definition.rank + 2}` as TileCode;

  return [code, nextCode, thirdCode];
}

function cloneCounts(counts: ReadonlyMap<TileCode, number>): Map<TileCode, number> {
  return new Map(counts);
}

function addCount(counts: Map<TileCode, number>, code: TileCode, delta: number): void {
  const nextCount = (counts.get(code) ?? 0) + delta;

  if (nextCount <= 0) {
    counts.delete(code);
    return;
  }

  counts.set(code, nextCount);
}
