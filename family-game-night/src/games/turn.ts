// Generic turn manager — reusable across games that take turns in seat order.
// Games embed a TurnState in their authoritative state and use these helpers.

export interface TurnState {
  order: string[]; // player ids in seat order
  activeIndex: number; // index into order whose turn it is
  direction: 1 | -1; // play direction (Uno Reverse flips it)
}

export function initTurn(playerIds: string[], startIndex = 0): TurnState {
  return { order: [...playerIds], activeIndex: startIndex, direction: 1 };
}

export function activePlayer(turn: TurnState): string {
  return turn.order[turn.activeIndex];
}

export function isActive(turn: TurnState, playerId: string): boolean {
  return activePlayer(turn) === playerId;
}

// Advance by `steps` players in the current direction (wraps around).
export function advance(turn: TurnState, steps = 1): TurnState {
  const n = turn.order.length;
  let idx = turn.activeIndex;
  for (let i = 0; i < steps; i++) {
    idx = (idx + turn.direction + n) % n;
  }
  return { ...turn, activeIndex: idx };
}

export function reverse(turn: TurnState): TurnState {
  return { ...turn, direction: (turn.direction * -1) as 1 | -1 };
}

// The player who is `steps` ahead, without mutating whose turn it is.
export function peek(turn: TurnState, steps = 1): string {
  const n = turn.order.length;
  let idx = turn.activeIndex;
  for (let i = 0; i < steps; i++) idx = (idx + turn.direction + n) % n;
  return turn.order[idx];
}

export function removePlayer(turn: TurnState, playerId: string): TurnState {
  const active = activePlayer(turn);
  const order = turn.order.filter((id) => id !== playerId);
  let activeIndex = order.indexOf(active);
  if (activeIndex === -1) {
    // active player was removed: keep same index position (wrapping)
    activeIndex = turn.activeIndex % Math.max(order.length, 1);
  }
  return { ...turn, order, activeIndex };
}
