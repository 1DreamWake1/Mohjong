import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TileGallery } from "./TileGallery.js";

describe("TileGallery", () => {
  it("renders all tile groups and representative tiles", () => {
    const html = renderToStaticMarkup(<TileGallery />);

    expect(html).toContain("万牌");
    expect(html).toContain("筒牌");
    expect(html).toContain("条牌");
    expect(html).toContain("风牌");
    expect(html).toContain("箭牌");
    expect(html).toContain("一萬");
    expect(html).toContain("9筒");
    expect(html).toContain("东");
    expect(html).toContain("白");
    expect(html).toContain('data-suit="characters"');
    expect(html).toContain("發");
  });
});
