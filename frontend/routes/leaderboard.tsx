import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { getApi } from "@/services/api";
import type { ScoreEntry } from "@/services/types";
import type { Mode } from "@/game/engine";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Snake Arena" },
      { name: "description", content: "Top Snake Arena scores per mode — walls and pass-through." },
      { property: "og:title", content: "Leaderboard — Snake Arena" },
      { property: "og:description", content: "Top Snake scores per mode." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const api = getApi();
  const [walls, setWalls] = useState<ScoreEntry[]>([]);
  const [wrap, setWrap] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [w, p] = await Promise.all([api.getLeaderboard("walls"), api.getLeaderboard("wrap")]);
      if (!cancelled) {
        setWalls(w);
        setWrap(p);
      }
    }
    load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-4xl font-bold">
          <span className="neon-cyan">Top</span> <span className="neon-magenta">scores</span>
        </h1>
        <p className="text-muted-foreground mt-2">Best run per player per mode.</p>
        <div className="grid gap-6 md:grid-cols-2 mt-8">
          <Board title="Walls" mode="walls" entries={walls} accent="magenta" />
          <Board title="Pass-through" mode="wrap" entries={wrap} accent="cyan" />
        </div>
      </main>
    </div>
  );
}

function Board({
  title,
  mode,
  entries,
  accent,
}: {
  title: string;
  mode: Mode;
  entries: ScoreEntry[];
  accent: "cyan" | "magenta";
}) {
  return (
    <div className="card-glow p-6">
      <div className="flex items-baseline justify-between">
        <h2 className={`text-xl font-bold ${accent === "cyan" ? "neon-cyan" : "neon-magenta"}`}>
          {title}
        </h2>
        <span className={`chip chip-${accent}`}>{mode}</span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No scores yet. Be the first.</p>
      ) : (
        <ol className="mt-6 space-y-2">
          {entries.map((e, i) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-sm w-6 text-right ${
                    i === 0 ? "neon-yellow" : "text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="font-medium">@{e.username}</span>
              </div>
              <span className="font-mono text-lg neon-yellow">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
