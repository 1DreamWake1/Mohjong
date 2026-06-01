import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionBar } from "./ActionBar.js";

describe("ActionBar", () => {
  it("renders available action buttons", () => {
    const html = renderToStaticMarkup(
      <ActionBar actions={[{ type: "peng" }, { type: "gang" }, { type: "hu" }]} />
    );

    expect(html).toContain("碰");
    expect(html).toContain("杠");
    expect(html).toContain("胡");
  });

  it("renders empty hint when no action is available", () => {
    const html = renderToStaticMarkup(<ActionBar actions={[]} />);

    expect(html).toContain("当前没有可执行操作");
  });
});
