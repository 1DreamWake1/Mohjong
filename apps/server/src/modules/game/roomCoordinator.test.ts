import { describe, expect, it } from "vitest";

import { createRoomCoordinator } from "./roomCoordinator.js";

describe("room coordinator", () => {
  it("serializes concurrent actions for one room", async () => {
    const coordinator = createRoomCoordinator();
    const order: number[] = [];
    const first = coordinator.runExclusive("room-1", async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(2);
    });
    const second = coordinator.runExclusive("room-1", async () => {
      order.push(3);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2, 3]);
    await coordinator.close();
  });

  it("allows different rooms to progress independently", async () => {
    const coordinator = createRoomCoordinator();
    let completed = 0;
    await Promise.all(
      ["room-a", "room-b"].map((roomId) =>
        coordinator.runExclusive(roomId, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          completed += 1;
        })
      )
    );
    expect(completed).toBe(2);
    await coordinator.close();
  });
});
