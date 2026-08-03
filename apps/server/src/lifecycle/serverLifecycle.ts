export type ReadinessState = "ready" | "starting" | "stopping";

export function createServerLifecycle() {
  let state: ReadinessState = "starting";

  return {
    beginShutdown(): void {
      state = "stopping";
    },
    getReadinessState(): ReadinessState {
      return state;
    },
    markReady(): void {
      if (state === "starting") {
        state = "ready";
      }
    }
  };
}

export type ServerLifecycle = ReturnType<typeof createServerLifecycle>;

export async function waitWithTimeout(
  operation: Promise<void>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
