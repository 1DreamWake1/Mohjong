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
  it("renders characters with Chinese rank above red traditional wan", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("characters", 3, "3万")} />);

    expect(html).toContain("三");
    expect(html).toContain("萬");
    expect(html).not.toContain(">3万<");
    expect(html).toContain("_characterRank_");
    expect(html).toContain("_characterWan_");
    expect(html).toContain('data-suit="characters"');
  });

  it("renders green dragon as traditional 發", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("dragons", 2, "发")} />);

    expect(html).toContain("發");
    expect(html).not.toContain(">发<");
    expect(html).toContain('data-rank="2"');
  });

  it("renders dot and bamboo patterns without duplicated suit captions", () => {
    const dotHtml = renderToStaticMarkup(<Tile tile={tile("dots", 5, "5筒")} />);
    const bambooHtml = renderToStaticMarkup(<Tile tile={tile("bamboo", 4, "4条")} />);

    expect(dotHtml).not.toContain(">5筒<");
    expect(dotHtml).not.toContain(">筒<");
    expect(bambooHtml).not.toContain(">4条<");
    expect(bambooHtml).not.toContain(">条<");
  });

  it("renders every dot and bamboo rank as a suit pattern", () => {
    const dotPatternNames = [
      "dotPatternSingle",
      "dotPatternColumn",
      "dotPatternColumn",
      "dotPatternGrid2x2",
      "dotPatternFive",
      "dotPatternSix",
      "dotPatternSeven",
      "dotPatternEight",
      "dotPatternNine"
    ];
    const bambooPatternNames = [
      "bambooPattern",
      "bambooPatternTwo",
      "bambooPatternThree",
      "bambooPatternFour",
      "bambooPatternFive",
      "bambooPatternSix",
      "bambooPatternSeven",
      "bambooPatternEight",
      "bambooPatternNine"
    ];

    for (const [index, patternName] of dotPatternNames.entries()) {
      const rank = index + 1;
      const html = renderToStaticMarkup(<Tile tile={tile("dots", rank, `${rank}筒`)} />);

      expect(html).toContain(`_${patternName}_`);
      expect(html).not.toContain(`>${rank}筒<`);
    }

    for (const [index, patternName] of bambooPatternNames.entries()) {
      const rank = index + 1;
      const html = renderToStaticMarkup(<Tile tile={tile("bamboo", rank, `${rank}条`)} />);

      expect(html).toContain(`_${patternName}_`);
      expect(html).not.toContain(`>${rank}条<`);
    }
  });

  it("renders seven dots and eight bamboo with reference layouts", () => {
    const sevenDotsHtml = renderToStaticMarkup(<Tile tile={tile("dots", 7, "7筒")} />);
    const eightBambooHtml = renderToStaticMarkup(<Tile tile={tile("bamboo", 8, "8条")} />);

    expect(sevenDotsHtml).toContain("_dotPatternSeven_");
    expect(sevenDotsHtml.match(/<span><\/span>/g)).toHaveLength(7);
    expect(eightBambooHtml.match(/_bambooPatternEightRow_/g)).toHaveLength(4);
  });

  it("renders three bamboo with a visible centered top stick", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("bamboo", 3, "3条")} />);

    expect(html).toContain("_bambooPatternThreeTop_");
    expect(html).toContain("_bambooPatternThreeRow_");
    expect(html).toMatch(/bambooPatternThreeTop_[^"]*"><span><\/span><\/span>/);
  });

  it("keeps non-interactive visible tiles in their suit colors", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("dots", 5, "5筒")} />);

    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(" disabled=");
  });

  it("renders white dragon as an empty framed mark", () => {
    const html = renderToStaticMarkup(<Tile tile={tile("dragons", 3, "白")} />);

    expect(html).toContain("_whiteDragonPattern_");
    expect(html).not.toContain(">白<");
  });

  it("keeps hidden tile faces private", () => {
    const html = renderToStaticMarkup(<Tile hidden tile={tile("dragons", 1, "中")} />);

    expect(html).not.toContain("中");
    expect(html).toContain("背面牌");
  });
});
