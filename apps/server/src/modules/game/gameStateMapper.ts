import type { GameEventMessage, PlayerView } from "@mahjong/shared";
import {
  compareTiles,
  getLegalActions,
  getWaitingTileScores,
  getWaitingTiles,
  type MahjongGameState
} from "mahjong-core";

export function createRoomPlayerView(input: {
  events: GameEventMessage[];
  roomId: string;
  seatIndex: number;
  state: MahjongGameState;
  turnDeadlineAt?: string;
  unlimitedHumanTurn?: boolean;
}): PlayerView {
  const player = input.state.players[input.seatIndex];
  if (!player) {
    throw new Error(`Unknown seat index: ${input.seatIndex}`);
  }

  const readyResults =
    input.state.phase === "ended" && input.state.rules.name === "sichuan"
      ? input.state.players.flatMap((readyPlayer) => {
          const waitingScores = getWaitingTileScores(input.state, readyPlayer.seatIndex);
          return waitingScores.length > 0
            ? [
                {
                  maxFanTotal: Math.max(...waitingScores.map((result) => result.fanTotal)),
                  maxPoints: Math.max(...waitingScores.map((result) => result.totalPoints)),
                  seatIndex: readyPlayer.seatIndex,
                  waitingTiles: waitingScores.map((result) => result.tile)
                }
              ]
            : [];
        })
      : [];

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
        username: otherPlayer.username,
        ...(input.state.gangScores
          ? { gangPoints: input.state.gangScores[otherPlayer.seatIndex] }
          : {}),
        ...(otherPlayer.hasWon ? { hasWon: true } : {})
      })),
    phase: input.state.phase,
    ...(player.hasWon ? { hasWon: true } : {}),
    ...(input.state.gangScores ? { gangPoints: input.state.gangScores[input.seatIndex] } : {}),
    ...(readyResults.length > 0 ? { readyResults } : {}),
    publicMelds: input.state.players.flatMap((meldPlayer) => meldPlayer.publicMelds),
    roomId: input.roomId,
    seatIndex: input.seatIndex,
    username: player.username,
    wallTileCount: input.state.wall.length,
    ...(input.state.phase === "playing" &&
    !input.state.players[input.state.currentTurn]?.isBot &&
    input.unlimitedHumanTurn
      ? { turnTimer: { mode: "unlimited" as const } }
      : input.state.phase === "playing" &&
          !input.state.players[input.state.currentTurn]?.isBot &&
          input.turnDeadlineAt
        ? { turnTimer: { deadlineAt: input.turnDeadlineAt, mode: "countdown" as const } }
        : {}),
    ...(input.state.lastDiscardedTileId
      ? { lastDiscardedTileId: input.state.lastDiscardedTileId }
      : {}),
    ...(player.lastDrawnTileId ? { lastDrawnTileId: player.lastDrawnTileId } : {}),
    ...(getWaitingTiles(input.state, input.seatIndex).length > 0
      ? { waitingTiles: getWaitingTiles(input.state, input.seatIndex) }
      : {}),
    ...(input.state.winRecords && input.state.winRecords.length > 0
      ? {
          winnerResults: input.state.winRecords.map((record) => ({
            endReason: "hu" as const,
            fans: record.score.fans.map((fan) => ({ name: fan.name, value: fan.value })),
            fanTotal: record.score.fanTotal,
            totalPoints: record.score.totalPoints,
            winType: record.winType,
            winnerSeatIndex: record.winnerSeatIndex,
            ...(record.winningTile ? { winningTile: record.winningTile } : {})
          }))
        }
      : {})
  };

  const result =
    input.state.phase === "ended" && input.state.endReason
      ? {
          endReason: input.state.endReason,
          fanTotal: input.state.score?.fanTotal ?? 0,
          fans: input.state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
          totalPoints: input.state.score?.totalPoints ?? 0,
          ...(input.state.endReason === "hu" && input.state.winType
            ? { winType: input.state.winType }
            : {}),
          ...(input.state.endReason === "hu" && input.state.winningTile
            ? { winningTile: input.state.winningTile }
            : {})
        }
      : undefined;

  const viewWithResult = result ? { ...view, result } : view;

  return input.state.winnerSeatIndex === undefined
    ? viewWithResult
    : { ...viewWithResult, winnerSeatIndex: input.state.winnerSeatIndex };
}
