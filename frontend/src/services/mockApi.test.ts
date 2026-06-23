import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createGame } from "@/game/engine";
import type { LiveGame } from "./types";
import { getApi, __resetApiForTests } from "./mockApi";

beforeEach(() => {
  __resetApiForTests();
});

afterEach(() => {
  __resetApiForTests();
});

function makeLiveGame(id: string, score: number): LiveGame {
  return {
    id,
    username: `player-${id}`,
    mode: "walls",
    state: { ...createGame({ width: 10, height: 10, mode: "walls" }), score },
    isBot: false,
    updatedAt: Date.now(),
  };
}

describe("mock api - auth", () => {
  it("signs up and logs in a user", async () => {
    const api = getApi();
    const u = await api.signUp("alice", "pass1234");
    expect(u.username).toBe("alice");
    expect(api.getCurrentUser()?.username).toBe("alice");
    await api.signOut();
    expect(api.getCurrentUser()).toBeNull();
    const u2 = await api.signIn("alice", "pass1234");
    expect(u2.id).toBe(u.id);
  });

  it("rejects duplicate usernames", async () => {
    const api = getApi();
    await api.signUp("bob", "pass1234");
    await expect(api.signUp("bob", "other1234")).rejects.toThrow(/taken/i);
  });

  it("rejects wrong password", async () => {
    const api = getApi();
    await api.signUp("carol", "pass1234");
    await api.signOut();
    await expect(api.signIn("carol", "nope1234")).rejects.toThrow(/invalid/i);
  });

  it("notifies auth subscribers", async () => {
    const api = getApi();
    const seen: (string | null)[] = [];
    const unsub = api.onAuthChange((u) => seen.push(u?.username ?? null));
    await api.signUp("dave", "pass1234");
    await api.signOut();
    unsub();
    expect(seen).toEqual(["dave", null]);
  });
});

describe("mock api - leaderboard", () => {
  it("returns top scores by mode, descending", async () => {
    const api = getApi();
    await api.signUp("eve", "pass1234");
    await api.submitScore({ mode: "walls", score: 30 });
    await api.submitScore({ mode: "walls", score: 80 });
    await api.submitScore({ mode: "wrap", score: 50 });
    const walls = await api.getLeaderboard("walls");
    expect(walls.map((s) => s.score)).toEqual([80, 30]);
    const wrap = await api.getLeaderboard("wrap");
    expect(wrap.map((s) => s.score)).toEqual([50]);
  });

  it("honors leaderboard limits", async () => {
    const api = getApi();
    await api.signUp("frank", "pass1234");
    await api.submitScore({ mode: "walls", score: 10 });
    await api.submitScore({ mode: "walls", score: 40 });
    await api.submitScore({ mode: "walls", score: 20 });

    const topTwo = await api.getLeaderboard("walls", 2);

    expect(topTwo.map((s) => s.score)).toEqual([40, 20]);
  });

  it("requires sign in to submit", async () => {
    const api = getApi();
    await expect(api.submitScore({ mode: "walls", score: 10 })).rejects.toThrow();
  });
});

describe("mock api - live games", () => {
  it("publishes and lists active games by score", () => {
    const api = getApi();
    api.publishGame(makeLiveGame("low", 5));
    api.publishGame(makeLiveGame("high", 50));

    const games = api.listActiveGames();

    expect(games[0]).toMatchObject({ id: "high" });
    expect(games.find((game) => game.id === "low")).toBeDefined();
  });

  it("subscribes to a single game", () => {
    const api = getApi();
    const game = makeLiveGame("solo", 15);
    let last: LiveGame | null = null;

    const unsub = api.subscribeToGame(game.id, (g) => (last = g));
    expect(last).toBeNull();

    api.publishGame(game);
    expect(last).toMatchObject({ id: "solo", state: { score: 15 } });

    api.removeGame(game.id);
    expect(last).toBeNull();
    unsub();
  });

  it("notifies active game subscribers until unsubscribed", () => {
    const api = getApi();
    const seen: string[][] = [];
    const unsub = api.subscribeToActiveGames((games) => {
      seen.push(games.map((game) => game.id));
    });

    api.publishGame(makeLiveGame("one", 10));
    api.publishGame(makeLiveGame("two", 20));
    unsub();
    api.publishGame(makeLiveGame("three", 30));

    expect(seen.at(-1)).toContain("two");
    expect(seen.at(-1)).toContain("one");
    expect(seen.at(-1)).not.toContain("three");
  });
});
