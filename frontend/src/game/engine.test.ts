import { describe, it, expect } from "vitest";
import { createGame, keyToDirection, placeFood, step, turn } from "./engine";

const rng = () => 0; // deterministic: always first free cell

describe("snake engine", () => {
  it("creates a game with snake of length 3 facing right", () => {
    const g = createGame({ width: 10, height: 10, rng });
    expect(g.snake).toHaveLength(3);
    expect(g.dir).toBe("right");
    expect(g.alive).toBe(true);
    expect(g.score).toBe(0);
  });

  it("moves the snake one cell per step", () => {
    const g = createGame({ width: 10, height: 10, rng });
    const head = g.snake[0];
    const g2 = step(g, rng);
    expect(g2.snake[0]).toEqual({ x: head.x + 1, y: head.y });
    expect(g2.snake).toHaveLength(3);
  });

  it("applies queued turns on the next step", () => {
    const g = turn(createGame({ width: 10, height: 10, rng }), "down");
    const g2 = step(g, rng);
    expect(g2.dir).toBe("down");
    expect(g2.snake[0]).toEqual({ x: 5, y: 6 });
  });

  it("ignores reverse direction", () => {
    const g = createGame({ width: 10, height: 10, rng });
    const g2 = turn(g, "left");
    expect(g2.queuedDir).toBe("right");
  });

  it("kills snake on wall in walls mode", () => {
    let g = createGame({ width: 6, height: 6, mode: "walls", rng });
    // head starts at (3,3) facing right -> walls at x=6
    for (let i = 0; i < 5; i++) g = step(g, rng);
    expect(g.alive).toBe(false);
  });

  it("does not advance a dead game", () => {
    const g = { ...createGame({ width: 6, height: 6, rng }), alive: false };
    expect(step(g, rng)).toBe(g);
  });

  it("wraps around in wrap mode", () => {
    let g = createGame({ width: 6, height: 6, mode: "wrap", rng });
    for (let i = 0; i < 6; i++) g = step(g, rng);
    expect(g.alive).toBe(true);
    expect(g.snake[0].x).toBeGreaterThanOrEqual(0);
    expect(g.snake[0].x).toBeLessThan(6);
  });

  it("grows and scores when eating food", () => {
    const g0 = createGame({ width: 10, height: 10, rng });
    // place food directly in front of head
    const head = g0.snake[0];
    const g = { ...g0, food: { x: head.x + 1, y: head.y } };
    const g2 = step(g, rng);
    expect(g2.score).toBe(10);
    expect(g2.snake).toHaveLength(4);
  });

  it("places food only on free cells", () => {
    const food = placeFood(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      2,
      2,
      rng,
    );
    expect(food).toEqual({ x: 1, y: 1 });
  });

  it("falls back when no free food cells remain", () => {
    const food = placeFood([{ x: 0, y: 0 }], 1, 1, rng);
    expect(food).toEqual({ x: 0, y: 0 });
  });

  it("dies on self collision", () => {
    let g = createGame({ width: 10, height: 10, rng });
    // grow long enough first by feeding directly
    g = {
      ...g,
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ],
      dir: "up",
      queuedDir: "up",
    };
    // moving up from (5,5) -> (5,4) is safe; instead force collision by turning into body
    g = turn(g, "right"); // (5,5) -> right would go to (6,5) which is body
    // 'right' is opposite of nothing here; current dir is 'up', right is allowed
    const g2 = step(g, rng);
    expect(g2.alive).toBe(false);
  });

  it("maps keys to directions", () => {
    expect(keyToDirection("ArrowUp")).toBe("up");
    expect(keyToDirection("w")).toBe("up");
    expect(keyToDirection("ArrowDown")).toBe("down");
    expect(keyToDirection("a")).toBe("left");
    expect(keyToDirection("d")).toBe("right");
    expect(keyToDirection("x")).toBeNull();
  });
});
