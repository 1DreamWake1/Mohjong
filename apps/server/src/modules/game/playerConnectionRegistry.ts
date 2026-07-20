export type PlayerConnectionRegistry = ReturnType<typeof createPlayerConnectionRegistry>;

export function createPlayerConnectionRegistry() {
  const socketCountByUserId = new Map<number, number>();

  function connect(userId: number): void {
    socketCountByUserId.set(userId, (socketCountByUserId.get(userId) ?? 0) + 1);
  }

  function disconnect(userId: number): void {
    const nextCount = (socketCountByUserId.get(userId) ?? 0) - 1;
    if (nextCount > 0) {
      socketCountByUserId.set(userId, nextCount);
      return;
    }
    socketCountByUserId.delete(userId);
  }

  function isOnline(userId: number): boolean {
    return (socketCountByUserId.get(userId) ?? 0) > 0;
  }

  return { connect, disconnect, isOnline };
}
