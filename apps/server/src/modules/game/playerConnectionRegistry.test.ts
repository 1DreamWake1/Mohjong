import { describe, expect, it } from "vitest";

import { createPlayerConnectionRegistry } from "./playerConnectionRegistry.js";

describe("playerConnectionRegistry", () => {
  it("keeps a player online until every socket disconnects", () => {
    const registry = createPlayerConnectionRegistry();

    registry.connect(12);
    registry.connect(12);
    registry.disconnect(12);
    expect(registry.isOnline(12)).toBe(true);

    registry.disconnect(12);
    expect(registry.isOnline(12)).toBe(false);
  });

  it("ignores extra disconnect notifications", () => {
    const registry = createPlayerConnectionRegistry();
    registry.disconnect(12);
    expect(registry.isOnline(12)).toBe(false);
  });
});
