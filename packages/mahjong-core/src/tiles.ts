import type { TileInfo, TileSuit } from "@mahjong/shared";

export type TileCode =
  | `m${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `p${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `s${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | "east"
  | "south"
  | "west"
  | "north"
  | "red"
  | "green"
  | "white";

export type TileDefinition = {
  code: TileCode;
  suit: TileSuit;
  rank: number;
  label: string;
};

export type Tile = TileInfo & {
  code: TileCode;
};

const suitedTileDefinitions = (
  prefix: "m" | "p" | "s",
  suit: Extract<TileSuit, "characters" | "dots" | "bamboo">,
  suffix: string
): TileDefinition[] =>
  Array.from({ length: 9 }, (_, index) => {
    const rank = index + 1;

    return {
      code: `${prefix}${rank}` as TileCode,
      suit,
      rank,
      label: `${rank}${suffix}`
    };
  });

export const tileDefinitions: readonly TileDefinition[] = [
  ...suitedTileDefinitions("m", "characters", "万"),
  ...suitedTileDefinitions("p", "dots", "筒"),
  ...suitedTileDefinitions("s", "bamboo", "条"),
  { code: "east", suit: "winds", rank: 1, label: "东" },
  { code: "south", suit: "winds", rank: 2, label: "南" },
  { code: "west", suit: "winds", rank: 3, label: "西" },
  { code: "north", suit: "winds", rank: 4, label: "北" },
  { code: "red", suit: "dragons", rank: 1, label: "中" },
  { code: "green", suit: "dragons", rank: 2, label: "发" },
  { code: "white", suit: "dragons", rank: 3, label: "白" }
];

const definitionsByCode = new Map(tileDefinitions.map((tile) => [tile.code, tile]));

export function getTileDefinition(code: TileCode): TileDefinition {
  const definition = definitionsByCode.get(code);

  if (!definition) {
    throw new Error(`Unknown tile code: ${code}`);
  }

  return definition;
}

export function createTile(code: TileCode, copyIndex: number): Tile {
  const definition = getTileDefinition(code);

  return {
    ...definition,
    id: `${code}-${copyIndex}`
  };
}

export function compareTiles(a: Tile, b: Tile): number {
  const suitOrder: Record<TileSuit, number> = {
    characters: 0,
    dots: 1,
    bamboo: 2,
    winds: 3,
    dragons: 4
  };

  return suitOrder[a.suit] - suitOrder[b.suit] || a.rank - b.rank;
}

export function isSuited(tile: TileDefinition): boolean {
  return tile.suit === "characters" || tile.suit === "dots" || tile.suit === "bamboo";
}

export function isSameTileType(a: TileDefinition, b: TileDefinition): boolean {
  return a.code === b.code;
}
