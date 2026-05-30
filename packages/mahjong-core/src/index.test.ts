import { describe, expect, it } from "vitest";

import { createEmptyPlayerView, standardRuleConfig } from "./index.js";

describe("mahjong-core scaffold", () => {
  it("defines the standard rule configuration", () => {
    expect(standardRuleConfig).toMatchObject({
      name: "standard",
      allowChi: true,
      allowPeng: true,
      allowGang: true
    });
  });

  it("creates an empty player view placeholder", () => {
    expect(createEmptyPlayerView(0)).toMatchObject({
      seatIndex: 0,
      phase: "waiting"
    });
  });
});
