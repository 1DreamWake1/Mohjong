import type { GameEventMessage, PlayerView } from "@mahjong/shared";
import { compareTiles, getLegalActions, type MahjongGameState } from "mahjong-core";

export function createRoomPlayerView(input: {
  events: GameEventMessage[];
  roomId: string;
  seatIndex: number;
  state: MahjongGameState;
}): PlayerView {
  const player = input.state.players[input.seatIndex];
  if (!player) {
    throw new Error(`Unknown seat index: ${input.seatIndex}`);
  }

  const view: PlayerView = {
    availableActions: getLegalActions(input.state, input.seatIndex),
    currentTurn: input.state.currentTurn,
    discardAreas: input.state.players.map((discardPlayer) => ({
      seatIndex: discardPlayer.seatIndex,
      tiles: discardPlayer.discardTiles
    })),
    eventMessages: input.events,
    handTiles: [...player.handTiles].sort(compareTiles),
    otherPlayers: input.state.players
      .filter((otherPlayer) => otherPlayer.seatIndex !== input.seatIndex)
      .map((otherPlayer) => ({
        handTileCount: otherPlayer.handTiles.length,
        isBot: otherPlayer.isBot,
        seatIndex: otherPlayer.seatIndex,
        username: otherPlayer.username
      })),
    phase: input.state.phase,
    publicMelds: input.state.players.flatMap((meldPlayer) => meldPlayer.publicMelds),
    roomId: input.roomId,
    seatIndex: input.seatIndex,
    username: player.username,
    wallTileCount: input.state.wall.length
  };

  const result =
    input.state.phase === "ended" && input.state.endReason
      ? {
          endReason: input.state.endReason,
          fanTotal: input.state.score?.fanTotal ?? 0,
          fans: input.state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
          totalPoints: input.state.score?.totalPoints ?? 0,
          ...(input.state.winningTile ? { winningTile: input.state.winningTile } : {})
        }
      : undefined;

  const viewWithResult = result ? { ...view, result } : view;

  return input.state.winnerSeatIndex === undefined
    ? viewWithResult
    : { ...viewWithResult, winnerSeatIndex: input.state.winnerSeatIndex };
}
