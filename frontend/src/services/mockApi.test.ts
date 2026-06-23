import { describe, it, expect, beforeEach } from "vitest";
import { getApi, __resetApiForTests } from "./mockApi";

beforeEach(() => {
  __resetApiForTests();
});

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

  it("requires sign in to submit", async () => {
    const api = getApi();
    await expect(api.submitScore({ mode: "walls", score: 10 })).rejects.toThrow();
  });
});

describe("mock api - live games", () => {
  it("publishes and lists active games (including bots)", () => {
    const api = getApi();
    const games = api.listActiveGames();
    // bots auto-publish on init
    expect(games.length).toBeGreaterThan(0);
  });

  it("subscribes to a single game", () => {
    const api = getApi();
    const first = api.listActiveGames()[0];
    let last = null as unknown;
    const unsub = api.subscribeToGame(first.id, (g) => (last = g));
    expect(last).not.toBeNull();
    unsub();
  });
});
