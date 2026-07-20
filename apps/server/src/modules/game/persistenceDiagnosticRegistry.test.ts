import { describe, expect, it } from "vitest";

import { createPersistenceDiagnosticRegistry } from "./persistenceDiagnosticRegistry.js";

describe("persistenceDiagnosticRegistry", () => {
  it("lists newest diagnostics first with normalized messages", () => {
    const registry = createPersistenceDiagnosticRegistry();
    registry.record({
      error: new Error("database locked"),
      operation: "append-event",
      roomId: "a"
    });
    registry.record({ error: "disk full", operation: "finish-record", roomId: "b" });

    expect(registry.list()).toMatchObject([
      { message: "disk full", operation: "finish-record", roomId: "b" },
      { message: "database locked", operation: "append-event", roomId: "a" }
    ]);
  });

  it("keeps only the configured number of recent diagnostics", () => {
    const registry = createPersistenceDiagnosticRegistry(2);
    registry.record({ error: "one", operation: "create-record", roomId: "1" });
    registry.record({ error: "two", operation: "create-record", roomId: "2" });
    registry.record({ error: "three", operation: "create-record", roomId: "3" });

    expect(registry.list().map((item) => item.roomId)).toEqual(["3", "2"]);
  });
});
