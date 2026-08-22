import {
  availableBoardWidth,
  boardDisplaySize,
  createGame,
  headingFromSwipeOnce,
  queueDirection,
  step,
  touchWithId,
  viewportSizeFrom,
} from "./game.js";

const KEY_TO_DIRECTION = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
};

const TICK_MS = 130;
const CELL = 28;

const COLORS = {
  board: "#0f172a",
  grid: "rgba(148, 163, 184, 0.12)",
  snake: "#4ade80",
  head: "#bbf7d0",
  food: "#fb7185",
  portalA: "#38bdf8",
  portalB: "#fb923c",
};

function el(id) {
  return document.getElementById(id);
}

export function mountGame() {
  const canvas = el("board");
  const scoreEl = el("score");
  const statusEl = el("status");
  const overlay = el("overlay");
  const overlayTitle = el("overlay-title");
  const newGameBtn = el("new-game");
  const overlayNewGameBtn = el("overlay-new-game");

  const ctx = canvas.getContext("2d");
  let state = createGame();
  let lastTick = 0;
  let rafId = 0;

  function verticalChrome() {
    const app = canvas.closest(".app") ?? document.body;
    const hud = document.querySelector(".hud");
    const legend = document.querySelector(".legend");
    const appStyle = getComputedStyle(app);
    const padY = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
    const hudH = hud ? hud.getBoundingClientRect().height : 0;
    const legendH = legend ? legend.getBoundingClientRect().height : 0;
    const hudMb = hud ? parseFloat(getComputedStyle(hud).marginBottom) || 0 : 0;
    const legendMt = legend ? parseFloat(getComputedStyle(legend).marginTop) || 0 : 0;
    return padY + hudH + hudMb + legendH + legendMt;
  }

  function resizeCanvas() {
    const backingW = state.width * CELL;
    const backingH = state.height * CELL;
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;

    const app = canvas.closest(".app") ?? document.body;
    const appStyle = getComputedStyle(app);
    const padX = parseFloat(appStyle.paddingLeft) + parseFloat(appStyle.paddingRight);
    const stageBorder = 2;
    const viewport = viewportSizeFrom(window.visualViewport, window.innerWidth, window.innerHeight);
    const maxWidth = availableBoardWidth(viewport.width, padX, app.clientWidth, stageBorder);
    const maxHeight = Math.max(1, viewport.height - verticalChrome() - stageBorder);
    const { cssWidth, cssHeight } = boardDisplaySize(
      state.width,
      state.height,
      CELL,
      maxWidth,
      maxHeight,
    );
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  function reset() {
    resetTouch();
    state = createGame();
    resizeCanvas();
    overlay.hidden = true;
    render();
  }

  function drawCell(cell, fill, radius = 6) {
    const x = cell.x * CELL;
    const y = cell.y * CELL;
    const pad = 3;
    ctx.fillStyle = fill;
    roundRect(ctx, x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, radius);
    ctx.fill();
  }

  function drawPortal(cell, fill) {
    const cx = cell.x * CELL + CELL / 2;
    const cy = cell.y * CELL + CELL / 2;
    ctx.save();
    ctx.shadowColor = fill;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = fill;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, CELL / 2 - 5, CELL / 2 - 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, CELL / 2 - 9, CELL / 2 - 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= state.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(canvas.width, y * CELL + 0.5);
      ctx.stroke();
    }

    if (state.portals) {
      drawPortal(state.portals[0], COLORS.portalA);
      drawPortal(state.portals[1], COLORS.portalB);
    }

    if (state.food) drawCell(state.food, COLORS.food, 10);

    for (let i = state.snake.length - 1; i >= 0; i -= 1) {
      drawCell(state.snake[i], i === 0 ? COLORS.head : COLORS.snake, i === 0 ? 8 : 6);
    }

    scoreEl.textContent = String(state.score);
    if (state.status === "dead") {
      const reason = state.deathReason === "wall" ? "Hit a wall" : "Hit yourself";
      statusEl.textContent = `Game over — ${reason}`;
      overlayTitle.textContent = `Game over — ${reason}`;
      overlay.hidden = false;
    } else {
      statusEl.textContent = "Playing";
      overlay.hidden = true;
    }
  }

  function tick(now) {
    if (now - lastTick >= TICK_MS) {
      lastTick = now;
      if (state.status === "playing") {
        state = step(state);
        render();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", (event) => {
    const direction = KEY_TO_DIRECTION[event.key];
    if (!direction) return;
    event.preventDefault();
    state = queueDirection(state, direction);
  });

  let touchId = null;
  let touchOrigin = null;
  let swipeQueued = false;

  function pointFromTouch(touch) {
    return { x: touch.clientX, y: touch.clientY };
  }

  function resetTouch() {
    touchId = null;
    touchOrigin = null;
    swipeQueued = false;
  }

  canvas.addEventListener(
    "touchstart",
    (event) => {
      if (touchId != null) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      touchId = touch.identifier;
      touchOrigin = pointFromTouch(touch);
      swipeQueued = false;
    },
    { passive: true },
  );

  canvas.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
      if (touchId == null || !touchOrigin) return;
      const touch =
        touchWithId(event.changedTouches, touchId) ?? touchWithId(event.touches, touchId);
      if (!touch) return;
      const direction = headingFromSwipeOnce(
        touch.clientX - touchOrigin.x,
        touch.clientY - touchOrigin.y,
        swipeQueued,
      );
      if (!direction) return;
      swipeQueued = true;
      state = queueDirection(state, direction);
    },
    { passive: false },
  );

  function endTrackedTouch(event) {
    if (touchId == null) return;
    if (!touchWithId(event.changedTouches, touchId)) return;
    resetTouch();
  }

  canvas.addEventListener("touchend", endTrackedTouch);
  canvas.addEventListener("touchcancel", endTrackedTouch);

  newGameBtn.addEventListener("click", reset);
  overlayNewGameBtn.addEventListener("click", reset);

  function onViewportChange() {
    resizeCanvas();
    render();
  }

  window.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);

  resizeCanvas();
  render();
  rafId = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(rafId);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

mountGame();
