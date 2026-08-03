import { createApp } from "./app.js";
import { readEnv } from "./config/env.js";
import { waitWithTimeout } from "./lifecycle/serverLifecycle.js";

const env = readEnv();
const app = await createApp();

await app.listen({
  host: env.host,
  port: env.port
});

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: NodeJS.Signals): Promise<void> {
  shutdownPromise ??= (async () => {
    app.lifecycle.beginShutdown();
    app.log.info({ signal }, "Mahjong server shutdown started");
    try {
      await waitWithTimeout(
        app.close(),
        env.shutdownTimeoutMs,
        `Shutdown exceeded ${env.shutdownTimeoutMs}ms`
      );
      app.log.info({ signal }, "Mahjong server shutdown completed");
    } catch (error) {
      app.log.fatal({ err: error, signal }, "Mahjong server shutdown failed");
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
