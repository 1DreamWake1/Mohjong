import type { GamePersistenceOperation } from "./gameRoomService.js";

export type PersistenceDiagnostic = {
  createdAt: string;
  id: string;
  message: string;
  operation: GamePersistenceOperation;
  roomId: string;
};

export type PersistenceDiagnosticRegistry = ReturnType<typeof createPersistenceDiagnosticRegistry>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown persistence error";
}

export function createPersistenceDiagnosticRegistry(maxEntries = 200) {
  const diagnostics: PersistenceDiagnostic[] = [];
  let nextId = 1;

  function record(input: {
    error: unknown;
    operation: GamePersistenceOperation;
    roomId: string;
  }): PersistenceDiagnostic {
    const diagnostic: PersistenceDiagnostic = {
      createdAt: new Date().toISOString(),
      id: `persistence-${nextId}`,
      message: getErrorMessage(input.error),
      operation: input.operation,
      roomId: input.roomId
    };
    nextId += 1;
    diagnostics.unshift(diagnostic);
    diagnostics.splice(maxEntries);
    return { ...diagnostic };
  }

  function list(): PersistenceDiagnostic[] {
    return diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  return { list, record };
}
