import type { LiveGame, ScoreEntry, SnakeApi, Unsubscribe, User } from "./types";
import type { Direction, GameState, Mode, Point } from "@/game/engine";
import { createGame, step, turn } from "@/game/engine";

const USERS_KEY = "snake.users";
const SESSION_KEY = "snake.session";
const SCORES_KEY = "snake.scores";

interface StoredUser {
  id: string;
  username: string;
  password: string; // mock only; do NOT do this in production
}

const isBrowser = typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (!isBrowser) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ------------ Bot simulation ------------
const BOT_NAMES = ["NeonViper", "GlitchHydra", "PixelPython", "VaporBoa"];

function chooseBotDir(state: GameState): Direction {
  const head = state.snake[0];
  const food = state.food;
  const candidates: Direction[] = [];
  if (food.x < head.x) candidates.push("left");
  if (food.x > head.x) candidates.push("right");
  if (food.y < head.y) candidates.push("up");
  if (food.y > head.y) candidates.push("down");
  const all: Direction[] = ["up", "down", "left", "right"];
  const order = [...candidates, ...all.filter((d) => !candidates.includes(d))];
  const body = new Set(state.snake.map((p) => `${p.x},${p.y}`));
  for (const d of order) {
    const next = nextHead(head, d, state);
    if (!next) continue;
    if (body.has(`${next.x},${next.y}`)) continue;
    return d;
  }
  return state.dir;
}

function nextHead(head: Point, dir: Direction, state: GameState): Point | null {
  const delta: Record<Direction, Point> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[dir] as unknown as Record<Direction, Point>;
  // ^ small hack: actually delta is already a Point — re-fetch correctly:
  const d: Point = (
    { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } } as Record<Direction, Point>
  )[dir];
  let x = head.x + d.x;
  let y = head.y + d.y;
  if (state.mode === "wrap") {
    x = (x + state.width) % state.width;
    y = (y + state.height) % state.height;
  } else if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return null;
  }
  return { x, y };
  void delta;
}

class MockApi implements SnakeApi {
  private currentUser: User | null = null;
  private authSubs = new Set<(u: User | null) => void>();
  private games = new Map<string, LiveGame>();
  private gamesSubs = new Set<(g: LiveGame[]) => void>();
  private singleSubs = new Map<string, Set<(g: LiveGame | null) => void>>();
  private botInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (isBrowser) {
      const session = read<User | null>(SESSION_KEY, null);
      this.currentUser = session;
      this.startBots();
    }
  }

  // ---------- auth ----------
  async signUp(username: string, password: string): Promise<User> {
    username = username.trim();
    if (username.length < 2) throw new Error("Username must be at least 2 characters");
    if (password.length < 4) throw new Error("Password must be at least 4 characters");
    const users = read<StoredUser[]>(USERS_KEY, []);
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already taken");
    }
    const user: StoredUser = { id: uid(), username, password };
    users.push(user);
    write(USERS_KEY, users);
    const pub: User = { id: user.id, username: user.username };
    this.setSession(pub);
    return pub;
  }

  async signIn(username: string, password: string): Promise<User> {
    const users = read<StoredUser[]>(USERS_KEY, []);
    const found = users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password,
    );
    if (!found) throw new Error("Invalid username or password");
    const pub: User = { id: found.id, username: found.username };
    this.setSession(pub);
    return pub;
  }

  async signOut(): Promise<void> {
    this.setSession(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  onAuthChange(cb: (user: User | null) => void): Unsubscribe {
    this.authSubs.add(cb);
    return () => this.authSubs.delete(cb);
  }

  private setSession(user: User | null) {
    this.currentUser = user;
    if (user) write(SESSION_KEY, user);
    else if (isBrowser) window.localStorage.removeItem(SESSION_KEY);
    this.authSubs.forEach((cb) => cb(user));
  }

  // ---------- scores ----------
  async submitScore(input: { mode: Mode; score: number }): Promise<ScoreEntry> {
    if (!this.currentUser) throw new Error("Must be signed in to submit a score");
    const entry: ScoreEntry = {
      id: uid(),
      userId: this.currentUser.id,
      username: this.currentUser.username,
      mode: input.mode,
      score: input.score,
      createdAt: Date.now(),
    };
    const all = read<ScoreEntry[]>(SCORES_KEY, []);
    all.push(entry);
    write(SCORES_KEY, all);
    return entry;
  }

  async getLeaderboard(mode: Mode, limit = 10): Promise<ScoreEntry[]> {
    const all = read<ScoreEntry[]>(SCORES_KEY, []);
    return all
      .filter((s) => s.mode === mode)
      .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  // ---------- live games ----------
  publishGame(game: LiveGame): void {
    this.games.set(game.id, game);
    this.emitGames();
    this.emitSingle(game.id);
  }

  removeGame(gameId: string): void {
    if (this.games.delete(gameId)) {
      this.emitGames();
      this.emitSingle(gameId);
    }
  }

  listActiveGames(): LiveGame[] {
    return [...this.games.values()].sort((a, b) => b.state.score - a.state.score);
  }

  getGame(gameId: string): LiveGame | null {
    return this.games.get(gameId) ?? null;
  }

  subscribeToActiveGames(cb: (games: LiveGame[]) => void): Unsubscribe {
    this.gamesSubs.add(cb);
    cb(this.listActiveGames());
    return () => this.gamesSubs.delete(cb);
  }

  subscribeToGame(gameId: string, cb: (game: LiveGame | null) => void): Unsubscribe {
    let set = this.singleSubs.get(gameId);
    if (!set) {
      set = new Set();
      this.singleSubs.set(gameId, set);
    }
    set.add(cb);
    cb(this.getGame(gameId));
    return () => {
      set?.delete(cb);
    };
  }

  private emitGames() {
    const list = this.listActiveGames();
    this.gamesSubs.forEach((cb) => cb(list));
  }

  private emitSingle(gameId: string) {
    const set = this.singleSubs.get(gameId);
    if (!set) return;
    const g = this.getGame(gameId);
    set.forEach((cb) => cb(g));
  }

  // ---------- bots ----------
  private startBots() {
    const bots: { id: string; name: string; mode: Mode; state: GameState }[] = BOT_NAMES.map((name, i) => {
      const mode: Mode = i % 2 === 0 ? "wrap" : "walls";
      return { id: `bot-${i}`, name, mode, state: createGame({ width: 22, height: 22, mode }) };
    });
    const publish = () => {
      for (const b of bots) {
        const dir = chooseBotDir(b.state);
        b.state = step(turn(b.state, dir));
        if (!b.state.alive) {
          b.state = createGame({ width: 22, height: 22, mode: b.mode });
        }
        this.publishGame({
          id: b.id,
          username: b.name,
          mode: b.mode,
          state: b.state,
          isBot: true,
          updatedAt: Date.now(),
        });
      }
    };
    publish();
    this.botInterval = setInterval(publish, 180);
  }
}

let instance: SnakeApi | null = null;
export function getApi(): SnakeApi {
  if (!instance) instance = new MockApi();
  return instance;
}

// test helper
export function __resetApiForTests() {
  if (isBrowser) {
    window.localStorage.removeItem(USERS_KEY);
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SCORES_KEY);
  }
  instance = null;
}
