// Pure Snake game engine. No DOM, fully testable.

export type Mode = "walls" | "wrap";
export type Direction = "up" | "down" | "left" | "right";
export interface Point {
  x: number;
  y: number;
}

export interface GameState {
  width: number;
  height: number;
  mode: Mode;
  snake: Point[]; // head first
  dir: Direction;
  queuedDir: Direction;
  food: Point;
  score: number;
  alive: boolean;
  tick: number;
}

export interface CreateOpts {
  width?: number;
  height?: number;
  mode?: Mode;
  rng?: () => number;
}

const DIRS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function createGame(opts: CreateOpts = {}): GameState {
  const width = opts.width ?? 22;
  const height = opts.height ?? 22;
  const mode = opts.mode ?? "walls";
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const snake: Point[] = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  const food = placeFood(snake, width, height, opts.rng ?? Math.random);
  return {
    width,
    height,
    mode,
    snake,
    dir: "right",
    queuedDir: "right",
    food,
    score: 0,
    alive: true,
    tick: 0,
  };
}

export function placeFood(
  snake: Point[],
  width: number,
  height: number,
  rng: () => number = Math.random,
): Point {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  const free: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 };
  return free[Math.floor(rng() * free.length)];
}

export function turn(state: GameState, dir: Direction): GameState {
  if (dir === OPPOSITE[state.dir]) return state; // ignore reverse
  return { ...state, queuedDir: dir };
}

export function step(state: GameState, rng: () => number = Math.random): GameState {
  if (!state.alive) return state;
  const dir = state.queuedDir;
  const delta = DIRS[dir];
  const head = state.snake[0];
  let nx = head.x + delta.x;
  let ny = head.y + delta.y;

  if (state.mode === "wrap") {
    nx = (nx + state.width) % state.width;
    ny = (ny + state.height) % state.height;
  } else {
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) {
      return { ...state, alive: false, dir, tick: state.tick + 1 };
    }
  }

  const ateFood = nx === state.food.x && ny === state.food.y;
  const newSnake: Point[] = [{ x: nx, y: ny }, ...state.snake];
  if (!ateFood) newSnake.pop();

  // self collision (after move; tail moved unless ate food)
  const collide = newSnake.slice(1).some((p) => p.x === nx && p.y === ny);
  if (collide) {
    return { ...state, alive: false, dir, tick: state.tick + 1 };
  }

  const food = ateFood ? placeFood(newSnake, state.width, state.height, rng) : state.food;
  return {
    ...state,
    snake: newSnake,
    dir,
    food,
    score: state.score + (ateFood ? 10 : 0),
    tick: state.tick + 1,
  };
}

export function keyToDirection(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}
