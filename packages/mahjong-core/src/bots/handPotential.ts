import { allowsSevenPairs, type RuleConfig } from "../rules.js";
import { isSuited, tileDefinitions, type Tile } from "../tiles.js";

const shantenCache = new Map<string, number>();
const maxShantenCacheEntries = 20_000;

export function calculateShanten(
  tiles: readonly Tile[],
  rules: RuleConfig,
  openMeldCount = 0
): number {
  const counts = tileDefinitions.map(
    (definition) => tiles.filter((tile) => tile.code === definition.code).length
  );
  const cacheKey = `${openMeldCount}:${allowsSevenPairs(rules) ? 1 : 0}:${counts.join("")}`;
  const cached = shantenCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let best = calculateStandardShanten(counts, openMeldCount);

  if (openMeldCount === 0 && allowsSevenPairs(rules)) {
    const pairKinds = counts.filter((count) => count >= 2).length;
    const distinctKinds = counts.filter((count) => count > 0).length;
    best = Math.min(best, 6 - pairKinds + Math.max(0, 7 - distinctKinds));
  }

  if (shantenCache.size >= maxShantenCacheEntries) shantenCache.clear();
  shantenCache.set(cacheKey, best);
  return best;
}

function calculateStandardShanten(initialCounts: readonly number[], openMeldCount: number): number {
  const counts = [...initialCounts];
  let best = 8;

  function search(index: number, meldCount: number, pairCount: number, partialCount: number): void {
    while (index < counts.length && counts[index] === 0) {
      index += 1;
    }

    if (index >= counts.length) {
      const totalMeldCount = Math.min(4, openMeldCount + meldCount);
      const usablePartialCount = Math.min(partialCount, 4 - totalMeldCount);
      best = Math.min(best, 8 - totalMeldCount * 2 - usablePartialCount - Math.min(pairCount, 1));
      return;
    }

    if ((counts[index] ?? 0) >= 3) {
      changeCount(counts, index, -3);
      search(index, meldCount + 1, pairCount, partialCount);
      changeCount(counts, index, 3);
    }

    const definition = tileDefinitions[index];
    if (
      definition &&
      isSuited(definition) &&
      definition.rank <= 7 &&
      counts[index + 1]! > 0 &&
      counts[index + 2]! > 0
    ) {
      changeCount(counts, index, -1);
      changeCount(counts, index + 1, -1);
      changeCount(counts, index + 2, -1);
      search(index, meldCount + 1, pairCount, partialCount);
      changeCount(counts, index, 1);
      changeCount(counts, index + 1, 1);
      changeCount(counts, index + 2, 1);
    }

    if ((counts[index] ?? 0) >= 2) {
      changeCount(counts, index, -2);
      search(index, meldCount, pairCount + 1, partialCount);
      search(index, meldCount, pairCount, partialCount + 1);
      changeCount(counts, index, 2);
    }

    if (definition && isSuited(definition)) {
      for (const offset of [1, 2]) {
        const otherDefinition = tileDefinitions[index + offset];
        if (otherDefinition?.suit === definition.suit && counts[index + offset]! > 0) {
          changeCount(counts, index, -1);
          changeCount(counts, index + offset, -1);
          search(index, meldCount, pairCount, partialCount + 1);
          changeCount(counts, index, 1);
          changeCount(counts, index + offset, 1);
        }
      }
    }

    changeCount(counts, index, -1);
    search(index, meldCount, pairCount, partialCount);
    changeCount(counts, index, 1);
  }

  search(0, 0, 0, 0);
  return best;
}

function changeCount(counts: number[], index: number, delta: number): void {
  counts[index] = (counts[index] ?? 0) + delta;
}
