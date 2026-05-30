import { createTile, tileDefinitions, type Tile } from "./tiles.js";

export type RandomSource = () => number;

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createWall(): Tile[] {
  return tileDefinitions.flatMap((definition) =>
    Array.from({ length: 4 }, (_, index) => createTile(definition.code, index))
  );
}

export function shuffleWall(wall: readonly Tile[], random: RandomSource = Math.random): Tile[] {
  const shuffled = [...wall];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    const currentTile = shuffled[index];
    const targetTile = shuffled[targetIndex];

    if (!currentTile || !targetTile) {
      throw new Error("Wall index out of bounds while shuffling");
    }

    shuffled[index] = targetTile;
    shuffled[targetIndex] = currentTile;
  }

  return shuffled;
}

export function createShuffledWall(random: RandomSource = Math.random): Tile[] {
  return shuffleWall(createWall(), random);
}
