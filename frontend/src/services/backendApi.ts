import type { LiveGame, ScoreEntry, SnakeApi, Unsubscribe, User } from "./types";
import type { Mode } from "@/game/engine";
import { API_BASE_URL } from "@/config";

const isBrowser = typeof window !== "undefined";

function getBaseUrl(): string {
  return API_BASE_URL;
}

function buildUrl(path: string): string {
  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

type BackendErrorBody = {
  detail?: unknown;
  message?: string;
  error?: string;
};

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return fallback;
  }

  try {
    const body = (await response.json()) as BackendErrorBody;
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    return fallback;
  } catch {
    return fallback;
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

class BackendApi implements SnakeApi {
  private currentUser: User | null = null;
  private activeGames: LiveGame[] = [];
  private gamesById = new Map<string, LiveGame>();
  private authSubs = new Set<(user: User | null) => void>();
  private eventSources = new Set<EventSource>();

  constructor() {
    if (isBrowser) {
      void this.bootstrap();
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      const user = await requestJson<User>("/auth/me");
      this.setCurrentUser(user);
    } catch (error) {
      if (error instanceof Error && /status 401/.test(error.message)) {
        this.setCurrentUser(null);
      } else {
        console.error(error);
      }
    } finally {
      await this.refreshGames();
    }
  }

  private setCurrentUser(user: User | null): void {
    this.currentUser = user;
    this.authSubs.forEach((cb) => cb(user));
  }

  private setActiveGames(games: LiveGame[]): void {
    this.activeGames = games;
    this.gamesById = new Map(games.map((game) => [game.id, game]));
  }

  private upsertGame(game: LiveGame): void {
    this.gamesById.set(game.id, game);
    this.activeGames = [...this.gamesById.values()].sort((a, b) => b.state.score - a.state.score);
  }

  private removeCachedGame(gameId: string): void {
    if (this.gamesById.delete(gameId)) {
      this.activeGames = [...this.gamesById.values()].sort((a, b) => b.state.score - a.state.score);
    }
  }

  private async refreshGames(): Promise<void> {
    try {
      const games = await requestJson<LiveGame[]>("/games");
      this.setActiveGames(games);
    } catch (error) {
      console.error(error);
    }
  }

  async signUp(username: string, password: string): Promise<User> {
    const user = await requestJson<User>("/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setCurrentUser(user);
    return user;
  }

  async signIn(username: string, password: string): Promise<User> {
    const user = await requestJson<User>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setCurrentUser(user);
    return user;
  }

  async signOut(): Promise<void> {
    await requestJson<void>("/auth/sign-out", { method: "POST" });
    this.setCurrentUser(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  onAuthChange(cb: (user: User | null) => void): Unsubscribe {
    this.authSubs.add(cb);
    return () => {
      this.authSubs.delete(cb);
    };
  }

  async submitScore(input: { mode: Mode; score: number }): Promise<ScoreEntry> {
    return requestJson<ScoreEntry>("/scores", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getLeaderboard(mode: Mode, limit = 10): Promise<ScoreEntry[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    return requestJson<ScoreEntry[]>(`/leaderboard/${mode}?${query.toString()}`);
  }

  publishGame(game: LiveGame): void {
    this.upsertGame(game);
    void requestJson<LiveGame>(`/games/${encodeURIComponent(game.id)}`, {
      method: "PUT",
      body: JSON.stringify(game),
    }).catch((error) => {
      console.error(error);
    });
  }

  removeGame(gameId: string): void {
    this.removeCachedGame(gameId);
    void requestJson<void>(`/games/${encodeURIComponent(gameId)}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error(error);
    });
  }

  listActiveGames(): LiveGame[] {
    return [...this.activeGames];
  }

  getGame(_gameId: string): LiveGame | null {
    return this.gamesById.get(_gameId) ?? null;
  }

  async getActiveGames(): Promise<LiveGame[]> {
    return requestJson<LiveGame[]>("/games");
  }

  async getGameSnapshot(gameId: string): Promise<LiveGame> {
    return requestJson<LiveGame>(`/games/${encodeURIComponent(gameId)}`);
  }

  subscribeToActiveGames(cb: (games: LiveGame[]) => void): Unsubscribe {
    const source = new EventSource(buildUrl("/games/stream"), { withCredentials: true });
    this.eventSources.add(source);

    const handleSnapshot = (event: MessageEvent<string>) => {
      const games = safeParse<LiveGame[]>(event.data);
      if (games) {
        this.setActiveGames(games);
        cb(games);
      }
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.onerror = () => {
      // Browser EventSource already retries; we only need to keep the stream open.
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.close();
      this.eventSources.delete(source);
    };
  }

  subscribeToGame(gameId: string, cb: (game: LiveGame | null) => void): Unsubscribe {
    const source = new EventSource(buildUrl(`/games/${encodeURIComponent(gameId)}/stream`), {
      withCredentials: true,
    });
    this.eventSources.add(source);

    const handleSnapshot = (event: MessageEvent<string>) => {
      const game = safeParse<LiveGame | null>(event.data);
      if (game) {
        this.upsertGame(game);
        cb(game);
      }
    };

    const handleRemoved = (event: MessageEvent<string>) => {
      const game = safeParse<LiveGame | null>(event.data);
      if (game) {
        this.upsertGame(game);
      } else {
        this.removeCachedGame(gameId);
      }
      cb(game);
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.addEventListener("removed", handleRemoved as EventListener);
    source.onerror = () => {
      // Keep the stream alive; the browser handles reconnects.
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.removeEventListener("removed", handleRemoved as EventListener);
      source.close();
      this.eventSources.delete(source);
    };
  }

  dispose(): void {
    this.eventSources.forEach((source) => source.close());
    this.eventSources.clear();
    this.authSubs.clear();
  }
}

let instance: BackendApi | null = null;

export function getApi(): SnakeApi {
  if (!instance) instance = new BackendApi();
  return instance;
}

export function __resetApiForTests(): void {
  instance?.dispose();
  instance = null;
}
