import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LandingPage } from "./LandingPage.js";

describe("LandingPage", () => {
  it("renders the product value proposition and login entry points", () => {
    const html = renderToStaticMarkup(<LandingPage />);

    expect(html).toContain("<h1>牌桌云</h1>");
    expect(html).toContain("专注对局，其他交给系统");
    expect(html).toContain("从邀请到开局，只要三步");
    expect(html.match(/href="\/login"/g)).toHaveLength(4);
  });
});
