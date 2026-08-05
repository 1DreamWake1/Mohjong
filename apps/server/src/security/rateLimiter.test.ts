import { describe, expect, it, vi } from "vitest";

import { createSlidingWindowRateLimiter, createUnlimitedRateLimiter } from "./rateLimiter.js";

describe("sliding window rate limiter", () => {
  it("allows requests up to the window limit", () => {
    const limiter = createSlidingWindowRateLimiter({ maxRequests: 3, windowMs: 1_000 });

    expect(limiter.isAllowed("user-1")).toBe(true);
    expect(limiter.isAllowed("user-1")).toBe(true);
    expect(limiter.isAllowed("user-1")).toBe(true);
    expect(limiter.isAllowed("user-1")).toBe(false);
  });

  it("tracks different keys independently", () => {
    const limiter = createSlidingWindowRateLimiter({ maxRequests: 1, windowMs: 1_000 });

    expect(limiter.isAllowed("user-1")).toBe(true);
    expect(limiter.isAllowed("user-2")).toBe(true);
    expect(limiter.isAllowed("user-1")).toBe(false);
  });

  it("lets the window slide after time passes", () => {
    vi.useFakeTimers();
    try {
      const limiter = createSlidingWindowRateLimiter({ maxRequests: 1, windowMs: 1_000 });

      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(false);

      vi.advanceTimersByTime(1_001);
      expect(limiter.isAllowed("user-1")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets all recorded timestamps", () => {
    const limiter = createSlidingWindowRateLimiter({ maxRequests: 1, windowMs: 1_000 });

    expect(limiter.isAllowed("user-1")).toBe(true);
    expect(limiter.isAllowed("user-1")).toBe(false);

    limiter.reset();
    expect(limiter.isAllowed("user-1")).toBe(true);
  });

  it("unlimited limiter never rejects", () => {
    const limiter = createUnlimitedRateLimiter();

    for (let index = 0; index < 100; index += 1) {
      expect(limiter.isAllowed("any-key")).toBe(true);
    }
    expect(() => limiter.reset()).not.toThrow();
  });
});
