import type { TileInfo } from "@mahjong/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tile } from "./Tile.js";

function tile(suit: TileInfo["suit"], rank: number, label: string): TileInfo {
  return {
    id: `${suit}-${rank}`,
    label,
    rank,
    suit
  };
}

describe("Tile", () => {
  it("renders characters with a suit caption", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("characters", 3, "3万")} />);

    expect(html).toContain("3万");
    expect(html).toContain("万");
  });

  it("renders dot and bamboo patterns instead of plain labels", () => {
    const dotHtml = renderToStaticMarkup(<Tile tile={tile("dots", 5, "5筒")} />);
    const bambooHtml = renderToStaticMarkup(<Tile tile={tile("bamboo", 4, "4条")} />);

    expect(dotHtml).toContain("筒");
    expect(dotHtml).not.toContain(">5筒<");
    expect(bambooHtml).toContain("条");
    expect(bambooHtml).not.toContain(">4条<");
  });

  it("keeps hidden tile faces private", () => {
    const html = renderToStaticMarkup(<Tile hidden tile={tile("dragons", 1, "中")} />);

    expect(html).not.toContain("中");
    expect(html).toContain("背面牌");
  });
});
