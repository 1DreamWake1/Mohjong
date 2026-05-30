import { chooseBasicBotAction } from "./bots/basicBot.js";
import { applyAction, createInitialGame, type MahjongGameState } from "./game.js";

export type SimulationResult = {
  state: MahjongGameState;
  turnCount: number;
};

export function runBasicBotGame(seed: number, maxTurns = 300): SimulationResult {
  let state = createInitialGame({ seed });
  let turnCount = 0;

  while (state.phase === "playing" && turnCount < maxTurns) {
    const action = chooseBasicBotAction(state, state.currentTurn);
    const result = applyAction(state, state.currentTurn, action);

    if (!result.ok) {
      throw new Error(`Bot selected illegal action: ${result.error}`);
    }

    state = result.state;
    turnCount += 1;
  }

  if (state.phase !== "ended") {
    throw new Error("Bot simulation exceeded max turns");
  }

  return { state, turnCount };
}
