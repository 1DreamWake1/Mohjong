import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const disconnect = vi.fn();
  const on = vi.fn();
  const createGameSocket = vi.fn((token: string) => ({
    auth: { token },
    disconnect,
    on
  }));

  return { createGameSocket, disconnect, on };
});

vi.mock("../socket/socketClient.js", () => ({
  createGameSocket: mocks.createGameSocket
}));

import { useSocketStore } from "./socketStore.js";

describe("socketStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSocketStore.setState({
      preparedToken: null,
      socket: null,
      status: "idle"
    });
  });

  it("prepares a socket without connecting it", () => {
    useSocketStore.getState().prepareSocket("token-a");

    expect(mocks.createGameSocket).toHaveBeenCalledWith("token-a");
    expect(useSocketStore.getState()).toMatchObject({
      preparedToken: "token-a",
      status: "ready"
    });
    expect(mocks.on).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mocks.on).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });

  it("reuses the prepared socket for the same token", () => {
    useSocketStore.getState().prepareSocket("token-a");
    useSocketStore.getState().prepareSocket("token-a");

    expect(mocks.createGameSocket).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects the previous socket when token changes", () => {
    useSocketStore.getState().prepareSocket("token-a");
    useSocketStore.getState().prepareSocket("token-b");

    expect(mocks.createGameSocket).toHaveBeenCalledTimes(2);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(useSocketStore.getState()).toMatchObject({
      preparedToken: "token-b",
      status: "ready"
    });
  });

  it("disconnects and clears the prepared socket", () => {
    useSocketStore.getState().prepareSocket("token-a");
    useSocketStore.getState().disconnectSocket();

    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(useSocketStore.getState()).toMatchObject({
      preparedToken: null,
      socket: null,
      status: "idle"
    });
  });
});
