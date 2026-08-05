export type RateLimiter = {
  /** 尝试消费一次配额；超过窗口内上限时返回 false。 */
  isAllowed(key: string): boolean;
  reset(): void;
};

export type RateLimiterOptions = {
  maxRequests: number;
  windowMs: number;
};

/**
 * 滑动窗口限流器：按 key 记录时间戳，窗口内请求数达到上限后拒绝，
 * 窗口滑动后旧记录自然过期。适用于登录、Socket 连接和游戏动作限流。
 */
export function createSlidingWindowRateLimiter(options: RateLimiterOptions): RateLimiter {
  const timestamps = new Map<string, number[]>();

  return {
    isAllowed(key): boolean {
      const now = Date.now();
      const windowStart = now - options.windowMs;
      const recent = (timestamps.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);

      if (recent.length >= options.maxRequests) {
        timestamps.set(key, recent);
        return false;
      }

      recent.push(now);
      timestamps.set(key, recent);
      return true;
    },

    reset(): void {
      timestamps.clear();
    }
  };
}

/** 不限制的限流器，用于开发环境或测试注入。 */
export function createUnlimitedRateLimiter(): RateLimiter {
  return {
    isAllowed(): boolean {
      return true;
    },
    reset(): void {
      // 无状态，无需清理。
    }
  };
}
