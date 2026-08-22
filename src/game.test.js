import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGame,
  queueDirection,
  step,
  wrapThroughPortals,
  cellsEqual,
  areOrthogonallyAdjacent,
  placePortals,
  headingFromSwipe,
  headingFromSwipeOnce,
  boardDisplaySize,
  availableBoardWidth,
  touchWithId,
  viewportSizeFrom,
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
  assert.equal(areOrthogonallyAdjacent(state.portals[0], state.portals[1]), false);
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
  assert.equal(areOrthogonallyAdjacent(next.portals[0], next.portals[1]), false);
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

test("areOrthogonallyAdjacent is true only for edge-sharing neighbors", () => {
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 4, y: 3 }), true);
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 2, y: 3 }), true);
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 3, y: 2 }), true);
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 3, y: 4 }), true);
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 4, y: 4 }), false);
  assert.equal(areOrthogonallyAdjacent({ x: 3, y: 3 }, { x: 5, y: 3 }), false);
});

test("placePortals never returns two orthogonally adjacent cells", () => {
  const sequential = {
    width: 8,
    height: 6,
    snake: [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ],
    food: { x: 0, y: 5 },
    portals: null,
    rng: () => 0,
  };
  const forced = placePortals(sequential);
  assert.ok(forced);
  assert.equal(areOrthogonallyAdjacent(forced[0], forced[1]), false);

  for (let i = 0; i < 200; i += 1) {
    let seed = (i + 1) * 9973;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const placed = placePortals({
      width: 10,
      height: 8,
      snake: [
        { x: 4, y: 4 },
        { x: 3, y: 4 },
        { x: 2, y: 4 },
      ],
      food: { x: 1, y: 1 },
      portals: null,
      rng,
    });
    assert.ok(placed);
    assert.equal(cellsEqual(placed[0], placed[1]), false);
    assert.equal(areOrthogonallyAdjacent(placed[0], placed[1]), false);
  }
});

test("headingFromSwipe maps the four swipe axes to the same headings as arrows/WASD", () => {
  assert.equal(headingFromSwipe(0, -40), "up");
  assert.equal(headingFromSwipe(0, 40), "down");
  assert.equal(headingFromSwipe(-40, 0), "left");
  assert.equal(headingFromSwipe(40, 0), "right");
});

test("headingFromSwipe ignores taps and follows the dominant axis", () => {
  assert.equal(headingFromSwipe(0, 0), null);
  assert.equal(headingFromSwipe(10, -8), null);
  assert.equal(headingFromSwipe(50, 12), "right");
  assert.equal(headingFromSwipe(-12, -50), "up");
});

test("swipe headings queue through queueDirection and still ignore a 180 against body heading", () => {
  const headingRight = playable({ direction: "right" });
  const reverse = headingFromSwipe(-40, 0);
  assert.equal(reverse, "left");
  assert.equal(queueDirection(headingRight, reverse).queuedDirection, null);

  const turn = headingFromSwipe(0, -40);
  assert.equal(turn, "up");
  const queued = queueDirection(headingRight, turn);
  assert.equal(queued.queuedDirection, "up");
  const next = step(queued);
  assert.equal(next.direction, "up");
});

test("headingFromSwipeOnce queues only the first qualifying move of a gesture", () => {
  assert.equal(headingFromSwipeOnce(10, 0, false), null);
  assert.equal(headingFromSwipeOnce(40, 0, false), "right");
  assert.equal(headingFromSwipeOnce(40, 80, true), null);
  assert.equal(headingFromSwipeOnce(-50, 0, true), null);
});

test("boardDisplaySize fits the full 20×28 grid into a phone viewport", () => {
  const desktop = boardDisplaySize(20, 20, 28, 800, 800);
  assert.deepEqual(desktop, { cssWidth: 560, cssHeight: 560 });

  const phone = boardDisplaySize(20, 20, 28, 343, 500);
  assert.equal(phone.cssWidth, 343);
  assert.equal(phone.cssHeight, 343);
  assert.ok(phone.cssWidth <= 343);
  assert.ok(phone.cssHeight <= 500);

  const landscape = boardDisplaySize(20, 20, 28, 700, 280);
  assert.equal(landscape.cssWidth, 280);
  assert.equal(landscape.cssHeight, 280);
});

test("availableBoardWidth uses one cap so width and height stay square", () => {
  assert.equal(availableBoardWidth(1200, 32, 720, 2), 718);
  assert.equal(availableBoardWidth(390, 32, 343, 2), 341);
  const size = boardDisplaySize(20, 20, 28, availableBoardWidth(800, 32, 720, 2), 500);
  assert.equal(size.cssWidth, size.cssHeight);
});

test("viewportSizeFrom prefers visualViewport and falls back to inner size", () => {
  assert.deepEqual(viewportSizeFrom({ width: 390, height: 620 }, 390, 844), {
    width: 390,
    height: 620,
  });
  assert.deepEqual(viewportSizeFrom(null, 1024, 768), { width: 1024, height: 768 });
  assert.deepEqual(viewportSizeFrom({ width: 0, height: 0 }, 375, 667), {
    width: 375,
    height: 667,
  });
});

test("touchWithId binds a gesture to the first identifier and ignores others", () => {
  const touches = [
    { identifier: 7, clientX: 10, clientY: 20 },
    { identifier: 9, clientX: 80, clientY: 90 },
  ];
  assert.equal(touchWithId(touches, 7).clientX, 10);
  assert.equal(touchWithId(touches, 9).clientY, 90);
  assert.equal(touchWithId(touches, 3), null);
  assert.equal(touchWithId(touches, null), null);
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
