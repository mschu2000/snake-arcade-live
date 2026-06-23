import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SnakeBoard } from "@/components/SnakeBoard";
import { getApi } from "@/services/api";
import type { LiveGame } from "@/services/types";

export const Route = createFileRoute("/spectate")({
  head: () => ({
    meta: [
      { title: "Spectate — Snake Arena" },
      { name: "description", content: "Watch active Snake Arena games in real time." },
      { property: "og:title", content: "Spectate — Snake Arena" },
      { property: "og:description", content: "Watch live Snake games right now." },
    ],
  }),
  component: SpectatePage,
});

function SpectatePage() {
  const api = getApi();
  const [games, setGames] = useState<LiveGame[]>([]);

  useEffect(() => api.subscribeToActiveGames(setGames), [api]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-4xl font-bold">
          <span className="neon-magenta">Live</span> <span className="neon-cyan">games</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          {games.length} active {games.length === 1 ? "snake" : "snakes"} — click one to watch.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <Link
              key={g.id}
              to="/spectate/$id"
              params={{ id: g.id }}
              className="card-glow p-4 hover:scale-[1.02] transition-transform"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">@{g.username}</span>
                  {g.isBot ? <span className="chip">bot</span> : <span className="chip chip-cyan">live</span>}
                </div>
                <span className="font-mono neon-yellow">{g.state.score}</span>
              </div>
              <div className="flex justify-center">
                <SnakeBoard state={g.state} cellSize={8} />
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className={`chip ${g.state.mode === "walls" ? "chip-magenta" : "chip-cyan"}`}>
                  {g.state.mode}
                </span>
                <span className="chip">length {g.state.snake.length}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
