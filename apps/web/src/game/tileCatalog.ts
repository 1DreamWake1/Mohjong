import type { TileInfo, TileSuit } from "@mahjong/shared";

export type TileCatalogGroup = {
  id: TileSuit;
  label: string;
  tiles: TileInfo[];
};

function suitedTiles(
  suit: Extract<TileSuit, "characters" | "dots" | "bamboo">,
  suffix: string
): TileInfo[] {
  return Array.from({ length: 9 }, (_, index) => {
    const rank = index + 1;

    return {
      id: `${suit}-${rank}`,
      label: `${rank}${suffix}`,
      rank,
      suit
    };
  });
}

export const tileCatalogGroups: TileCatalogGroup[] = [
  {
    id: "characters",
    label: "万牌",
    tiles: suitedTiles("characters", "万")
  },
  {
    id: "dots",
    label: "筒牌",
    tiles: suitedTiles("dots", "筒")
  },
  {
    id: "bamboo",
    label: "条牌",
    tiles: suitedTiles("bamboo", "条")
  },
  {
    id: "winds",
    label: "风牌",
    tiles: [
      { id: "winds-1", label: "东", rank: 1, suit: "winds" },
      { id: "winds-2", label: "南", rank: 2, suit: "winds" },
      { id: "winds-3", label: "西", rank: 3, suit: "winds" },
      { id: "winds-4", label: "北", rank: 4, suit: "winds" }
    ]
  },
  {
    id: "dragons",
    label: "箭牌",
    tiles: [
      { id: "dragons-1", label: "中", rank: 1, suit: "dragons" },
      { id: "dragons-2", label: "发", rank: 2, suit: "dragons" },
      { id: "dragons-3", label: "白", rank: 3, suit: "dragons" }
    ]
  }
];

export const allCatalogTiles = tileCatalogGroups.flatMap((group) => group.tiles);
