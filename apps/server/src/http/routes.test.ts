import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

describe("routes", () => {
  it("returns health status", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
