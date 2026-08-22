# Portal Snake

A small grid-based Snake game for the browser, with one matching pair of portals.

## Play

Serve the folder and open `index.html` (ES modules need a local server):

```bash
npm start
```

Then open http://localhost:8080.

- **Move:** arrow keys or WASD
- **Goal:** eat food to grow and score
- **Death:** hitting a wall or your own body
- **New Game:** resets the board, snake, score, food, and portals

Portals: entering one places the snake head on the other with the same heading. Eating food relocates the portal pair to two new empty cells.

## Tests

Core rules live in `src/game.js` as plain functions. The canvas UI in `src/ui.js` only calls those functions.

```bash
npm test
```
