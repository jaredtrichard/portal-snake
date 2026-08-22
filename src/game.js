/**
 * Portal Snake — pure game logic (no DOM).
 *
 * Rules:
 * - The snake moves one grid cell per tick in its current heading.
 * - Eating food grows the snake by one segment and adds 1 to the score.
 * - Hitting a wall or any occupied snake cell (including via a portal) ends the game.
 * - The board always has exactly one matching portal pair. Entering one portal
 *   places the head on the other portal with the same heading. Occupying the
 *   exit portal does not immediately re-teleport; the next tick continues
 *   forward from there.
 * - Eating food always relocates both portals to two new empty cells (not on
 *   the snake, the new food, or each other, and not orthogonally adjacent).
 *   A new pair is spawned the same way if none exist yet. Orthogonal neighbors
 *   (sharing an edge) are rejected because they are death traps; diagonal is OK.
 */

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DEFAULT_WIDTH = 20;
export const DEFAULT_HEIGHT = 20;

export function cellsEqual(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

/** True when two cells share an edge (up/down/left/right). Diagonal is not adjacent. */
export function areOrthogonallyAdjacent(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function isOpposite(a, b) {
  return DIRECTIONS[a].x + DIRECTIONS[b].x === 0 && DIRECTIONS[a].y + DIRECTIONS[b].y === 0;
}

/** Dominant-axis swipe delta → the same four headings as arrows/WASD. */
export const SWIPE_MIN_DISTANCE = 24;

export function headingFromSwipe(dx, dy, minDistance = SWIPE_MIN_DISTANCE) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < minDistance && absY < minDistance) return null;
  if (absX >= absY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function defaultSnake(width, height) {
  const y = Math.floor(height / 2);
  const x = Math.max(2, Math.floor(width / 4));
  return [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
  ];
}

function collectOccupied(state, extra = []) {
  const occupied = new Set();
  for (const cell of state.snake) occupied.add(cellKey(cell));
  if (state.food) occupied.add(cellKey(state.food));
  if (state.portals) {
    occupied.add(cellKey(state.portals[0]));
    occupied.add(cellKey(state.portals[1]));
  }
  for (const cell of extra) occupied.add(cellKey(cell));
  return occupied;
}

export function emptyCells(state, extraOccupied = []) {
  const occupied = collectOccupied(state, extraOccupied);
  const cells = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells;
}

export function pickEmptyCell(state, rng = state.rng, extraOccupied = []) {
  const cells = emptyCells(state, extraOccupied);
  if (cells.length === 0) return null;
  const index = Math.floor(rng() * cells.length);
  return cells[index];
}

export function placeFood(state) {
  // Food may not sit on the snake or a portal.
  return pickEmptyCell(state, state.rng);
}

/**
 * Always pick two distinct empty cells for the matching pair.
 * Occupied: snake and food. The pair must not be orthogonally adjacent
 * (sharing an edge) — those placements are instant death traps.
 */
export function placePortals(state) {
  const cells = emptyCells({ ...state, portals: null });
  if (cells.length < 2) return null;

  const start = Math.floor(state.rng() * cells.length);
  for (let offset = 0; offset < cells.length; offset += 1) {
    const first = cells[(start + offset) % cells.length];
    const candidates = cells.filter(
      (cell) => !cellsEqual(cell, first) && !areOrthogonallyAdjacent(cell, first),
    );
    if (candidates.length === 0) continue;
    const second = candidates[Math.floor(state.rng() * candidates.length)];
    return [first, second];
  }
  return null;
}

export function createGame(config = {}) {
  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const rng = config.rng ?? Math.random;

  let state = {
    width,
    height,
    snake: config.snake ?? defaultSnake(width, height),
    direction: config.direction ?? "right",
    queuedDirection: config.queuedDirection ?? null,
    food: config.food ?? null,
    portals: config.portals ?? null,
    score: config.score ?? 0,
    status: config.status ?? "playing",
    deathReason: config.deathReason ?? null,
    rng,
  };

  if (!state.food) {
    state = { ...state, food: placeFood(state) };
  }
  if (!("portals" in config) || config.portals === undefined) {
    state = { ...state, portals: placePortals(state) };
  }
  return state;
}

export function queueDirection(state, direction) {
  if (!DIRECTIONS[direction]) return state;
  if (state.status !== "playing") return state;
  // Reject a 180 against the committed body heading, not the buffered turn.
  // Otherwise: heading right, queue up, then queue left in the same tick would
  // replace the buffer with a reverse into the neck.
  if (isOpposite(state.direction, direction)) return state;
  return { ...state, queuedDirection: direction };
}

/**
 * If `cell` is a portal, return the matching portal; otherwise return `cell`.
 * Heading is not modified here — callers keep the current direction.
 */
export function wrapThroughPortals(portals, cell) {
  if (!portals) return cell;
  const [portalA, portalB] = portals;
  if (cellsEqual(cell, portalA)) return { ...portalB };
  if (cellsEqual(cell, portalB)) return { ...portalA };
  return cell;
}

function nextHead(state, direction) {
  const head = state.snake[0];
  const delta = DIRECTIONS[direction];
  const stepped = { x: head.x + delta.x, y: head.y + delta.y };
  return wrapThroughPortals(state.portals, stepped);
}

function outOfBounds(state, cell) {
  return cell.x < 0 || cell.y < 0 || cell.x >= state.width || cell.y >= state.height;
}

function hitsSelf(snake, cell, ignoreTail) {
  const body = ignoreTail ? snake.slice(0, -1) : snake;
  return body.some((segment) => cellsEqual(segment, cell));
}

export function step(state) {
  if (state.status !== "playing") return state;

  const direction = state.queuedDirection ?? state.direction;
  const head = nextHead(state, direction);

  if (outOfBounds(state, head)) {
    return {
      ...state,
      direction,
      queuedDirection: null,
      status: "dead",
      deathReason: "wall",
    };
  }

  const eating = cellsEqual(head, state.food);
  if (hitsSelf(state.snake, head, !eating)) {
    return {
      ...state,
      direction,
      queuedDirection: null,
      status: "dead",
      deathReason: "self",
    };
  }

  const snake = [head, ...state.snake];
  if (!eating) {
    snake.pop();
    return {
      ...state,
      snake,
      direction,
      queuedDirection: null,
    };
  }

  // Grow, score, then relocate food and the portal pair.
  const grown = {
    ...state,
    snake,
    direction,
    queuedDirection: null,
    score: state.score + 1,
    food: null,
    portals: null,
  };
  const food = placeFood(grown);
  const withFood = { ...grown, food };
  const portals = placePortals(withFood);
  return { ...withFood, portals };
}
