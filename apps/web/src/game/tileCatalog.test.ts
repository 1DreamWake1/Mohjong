import { describe, expect, it } from "vitest";

import { allCatalogTiles, tileCatalogGroups } from "./tileCatalog.js";

describe("tileCatalog", () => {
  it("contains every base mahjong tile exactly once", () => {
    expect(allCatalogTiles).toHaveLength(34);
    expect(new Set(allCatalogTiles.map((tile) => tile.id)).size).toBe(34);
  });

  it("groups tiles by suit", () => {
    expect(tileCatalogGroups.map((group) => [group.id, group.tiles.length])).toEqual([
      ["characters", 9],
      ["dots", 9],
      ["bamboo", 9],
      ["winds", 4],
      ["dragons", 3]
    ]);
  });
});
