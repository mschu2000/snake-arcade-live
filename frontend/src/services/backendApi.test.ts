import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "./types";
import { getApi, __resetApiForTests } from "./backendApi";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  options?: EventSourceInit;
  closed = false;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.options = options;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

afterEach(() => {
  __resetApiForTests();
  FakeEventSource.instances.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backend api", () => {
  it("reads auth and leaderboard data through fetch", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse({ detail: "Authentication required" }, { status: 401 });
      }
      if (url.endsWith("/games")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/auth/sign-in")) {
        expect(init?.credentials).toBe("include");
        return jsonResponse({ id: "u1", username: "alice" });
      }
      if (url.endsWith("/leaderboard/walls?limit=10")) {
        return jsonResponse([
          { id: "s1", userId: "u1", username: "alice", mode: "walls", score: 80, createdAt: 1 },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);

    const api = getApi();
    const user = await api.signIn("alice", "pass1234");
    const leaderboard = await api.getLeaderboard("walls");

    expect(user.username).toBe("alice");
    expect(api.getCurrentUser()?.username).toBe("alice");
    expect(leaderboard).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/sign-in"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("subscribes to live game streams and keeps local caches in sync", () => {
    const game: LiveGame = {
      id: "game-1",
      username: "ava",
      mode: "walls",
      state: {
        width: 10,
        height: 10,
        mode: "walls",
        snake: [{ x: 5, y: 5 }],
        dir: "right",
        queuedDir: "right",
        food: { x: 2, y: 2 },
        score: 40,
        alive: true,
        tick: 3,
      },
      isBot: false,
      updatedAt: 123,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/me"))
          return jsonResponse({ detail: "Authentication required" }, { status: 401 });
        if (url.endsWith("/games")) return jsonResponse([]);
        if (url.endsWith("/games/game-1")) return jsonResponse(game);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);

    const api = getApi();
    const seen: LiveGame[][] = [];
    const unsub = api.subscribeToActiveGames((games) => seen.push(games));
    const activeSource = FakeEventSource.instances[0];
    activeSource.emit("snapshot", [game]);

    expect(seen.at(-1)?.[0].id).toBe("game-1");
    expect(api.listActiveGames()[0].id).toBe("game-1");

    const seenGame: Array<string | null> = [];
    const unsubGame = api.subscribeToGame("game-1", (current) =>
      seenGame.push(current?.id ?? null),
    );
    const gameSource = FakeEventSource.instances[1];
    gameSource.emit("snapshot", game);
    gameSource.emit("removed", null);

    expect(seenGame).toContain("game-1");
    expect(seenGame.at(-1)).toBeNull();
    expect(api.getGame("game-1")).toBeNull();

    unsub();
    unsubGame();
    expect(activeSource.closed).toBe(true);
    expect(gameSource.closed).toBe(true);
  });
});
