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

  return input.state.winnerSeatIndex === undefined
    ? view
    : { ...view, winnerSeatIndex: input.state.winnerSeatIndex };
}
