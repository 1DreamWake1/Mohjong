import { describe, expect, it, vi } from "vitest";

import { createServerLifecycle, waitWithTimeout } from "./serverLifecycle.js";

describe("server lifecycle", () => {
  it("moves from starting to ready and then stopping", () => {
    const lifecycle = createServerLifecycle();

    expect(lifecycle.getReadinessState()).toBe("starting");
    lifecycle.markReady();
    expect(lifecycle.getReadinessState()).toBe("ready");
    lifecycle.beginShutdown();
    expect(lifecycle.getReadinessState()).toBe("stopping");
    lifecycle.markReady();
    expect(lifecycle.getReadinessState()).toBe("stopping");
  });

  it("rejects an operation that exceeds the shutdown timeout", async () => {
    vi.useFakeTimers();
    const operation = new Promise<void>(() => undefined);
    const result = waitWithTimeout(operation, 100, "shutdown timed out");
    const expectation = expect(result).rejects.toThrow("shutdown timed out");

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    vi.useRealTimers();
  });
});
