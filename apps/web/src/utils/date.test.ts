import { describe, expect, it } from "vitest";

import { formatDateTime } from "./date.js";

describe("date utils", () => {
  it("formats ISO date strings for display", () => {
    expect(formatDateTime("2026-05-30T12:34:56.000Z")).toMatch(/2026.*05.*30/);
  });

  it("returns a fallback for invalid dates", () => {
    expect(formatDateTime("not-a-date")).toBe("-");
  });
});
