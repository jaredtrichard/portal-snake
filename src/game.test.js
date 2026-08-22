import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGame,
  queueDirection,
  step,
  wrapThroughPortals,
  cellsEqual,
} from "./game.js";

function firstAvailableRng() {
  return () => 0;
}

function playable(overrides = {}) {
  return createGame({
    width: 10,
    height: 8,
    rng: firstAvailableRng(),
    snake: [
      { x: 3, y: 4 },
      { x: 2, y: 4 },
      { x: 1, y: 4 },
    ],
    direction: "right",
    food: { x: 8, y: 1 },
    portals: [
      { x: 1, y: 1 },
      { x: 8, y: 6 },
    ],
    ...overrides,
  });
}

test("createGame starts with a snake, food, score 0, and a portal pair", () => {
  const state = createGame({
    width: 10,
    height: 8,
    rng: firstAvailableRng(),
  });
  assert.equal(state.status, "playing");
  assert.equal(state.score, 0);
  assert.ok(state.snake.length >= 3);
  assert.ok(state.food);
  assert.equal(state.portals.length, 2);
  assert.equal(cellsEqual(state.portals[0], state.portals[1]), false);
});

test("eating food grows the snake and increases score", () => {
  const state = playable({
    food: { x: 4, y: 4 },
  });
  const next = step(state);
  assert.equal(next.status, "playing");
  assert.equal(next.snake.length, state.snake.length + 1);
  assert.deepEqual(next.snake[0], { x: 4, y: 4 });
  assert.equal(next.score, state.score + 1);
  assert.equal(cellsEqual(next.food, { x: 4, y: 4 }), false);
});

test("score accumulates across multiple eats", () => {
  let state = playable({
    food: { x: 4, y: 4 },
    portals: [
      { x: 0, y: 0 },
      { x: 9, y: 7 },
    ],
  });
  state = step(state);
  assert.equal(state.score, 1);
  state = { ...state, food: { x: state.snake[0].x + 1, y: state.snake[0].y } };
  state = step(state);
  assert.equal(state.score, 2);
  assert.equal(state.snake.length, 5);
});

test("hitting a wall ends the game", () => {
  const state = playable({
    snake: [
      { x: 9, y: 4 },
      { x: 8, y: 4 },
      { x: 7, y: 4 },
    ],
    direction: "right",
    food: { x: 0, y: 0 },
    portals: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
  });
  const next = step(state);
  assert.equal(next.status, "dead");
  assert.equal(next.deathReason, "wall");
  assert.equal(next.snake.length, state.snake.length);
});

test("running into the body ends the game", () => {
  const state = playable({
    snake: [
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
    ],
    direction: "left",
    food: { x: 9, y: 0 },
    portals: [
      { x: 0, y: 0 },
      { x: 9, y: 7 },
    ],
  });
  const next = step(state);
  assert.equal(next.status, "dead");
  assert.equal(next.deathReason, "self");
});

test("entering portal A appears at portal B with heading unchanged", () => {
  const portalA = { x: 4, y: 4 };
  const portalB = { x: 7, y: 2 };
  const state = playable({
    snake: [
      { x: 3, y: 4 },
      { x: 2, y: 4 },
      { x: 1, y: 4 },
    ],
    direction: "right",
    food: { x: 0, y: 7 },
    portals: [portalA, portalB],
  });

  const next = step(state);
  assert.equal(next.status, "playing");
  assert.deepEqual(next.snake[0], portalB);
  assert.equal(next.direction, "right");
  assert.deepEqual(next.portals, [portalA, portalB]);
});

test("entering portal B appears at portal A with heading unchanged", () => {
  const portalA = { x: 4, y: 4 };
  const portalB = { x: 7, y: 2 };
  const state = playable({
    snake: [
      { x: 7, y: 3 },
      { x: 7, y: 4 },
      { x: 7, y: 5 },
    ],
    direction: "up",
    food: { x: 0, y: 7 },
    portals: [portalA, portalB],
  });

  const next = step(state);
  assert.equal(next.status, "playing");
  assert.deepEqual(next.snake[0], portalA);
  assert.equal(next.direction, "up");
});

test("wrapThroughPortals keeps a non-portal cell unchanged", () => {
  const portals = [
    { x: 1, y: 1 },
    { x: 5, y: 5 },
  ];
  assert.deepEqual(wrapThroughPortals(portals, { x: 3, y: 3 }), { x: 3, y: 3 });
});

test("eating food relocates the portal pair", () => {
  const portals = [
    { x: 0, y: 0 },
    { x: 9, y: 7 },
  ];
  const state = playable({
    food: { x: 4, y: 4 },
    portals,
  });
  const next = step(state);
  assert.equal(next.portals.length, 2);
  assert.equal(cellsEqual(next.portals[0], next.portals[1]), false);
  const samePair =
    cellsEqual(next.portals[0], portals[0]) && cellsEqual(next.portals[1], portals[1]);
  assert.equal(samePair, false);

  const occupied = new Set(next.snake.map((cell) => `${cell.x},${cell.y}`));
  occupied.add(`${next.food.x},${next.food.y}`);
  for (const portal of next.portals) {
    assert.equal(occupied.has(`${portal.x},${portal.y}`), false);
  }
});

test("queueDirection ignores a 180-degree reverse", () => {
  const state = playable({ direction: "right" });
  const queued = queueDirection(state, "left");
  assert.equal(queued.queuedDirection, null);
  const next = step(queueDirection(state, "up"));
  assert.equal(next.direction, "up");
  assert.deepEqual(next.snake[0], { x: 3, y: 3 });
});

test("queueDirection ignores a same-tick reverse after a perpendicular press", () => {
  const headingRight = playable({ direction: "right" });
  const afterUp = queueDirection(headingRight, "up");
  assert.equal(afterUp.queuedDirection, "up");

  const afterLeft = queueDirection(afterUp, "left");
  assert.equal(afterLeft.queuedDirection, "up");

  const next = step(afterLeft);
  assert.equal(next.status, "playing");
  assert.equal(next.deathReason, null);
  assert.equal(next.direction, "up");
  assert.deepEqual(next.snake[0], { x: 3, y: 3 });
});

test("New Game via createGame resets score and play status", () => {
  let state = playable({
    score: 11,
    status: "dead",
    deathReason: "wall",
  });
  state = createGame({
    width: state.width,
    height: state.height,
    rng: firstAvailableRng(),
  });
  assert.equal(state.score, 0);
  assert.equal(state.status, "playing");
  assert.equal(state.deathReason, null);
  assert.ok(state.snake.length >= 3);
});

test("a dead snake does not move on later ticks", () => {
  const dead = playable({
    status: "dead",
    deathReason: "wall",
  });
  const next = step(dead);
  assert.deepEqual(next.snake, dead.snake);
  assert.equal(next.status, "dead");
});
