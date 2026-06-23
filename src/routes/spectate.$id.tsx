import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SnakeBoard } from "@/components/SnakeBoard";
import { getApi } from "@/services/api";
import type { LiveGame } from "@/services/types";

export const Route = createFileRoute("/spectate/$id")({
  head: () => ({
    meta: [
      { title: "Watching game — Snake Arena" },
      { name: "description", content: "Watch a live Snake game in real time." },
      { property: "og:title", content: "Watching live — Snake Arena" },
      { property: "og:description", content: "Watch a live Snake game." },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const api = getApi();
  const [game, setGame] = useState<LiveGame | null>(null);

  useEffect(() => api.subscribeToGame(id, setGame), [api, id]);

  if (!game) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold neon-magenta">Game ended</h1>
          <p className="text-muted-foreground mt-2">
            This snake is no longer broadcasting. Maybe they hit a wall.
          </p>
          <div className="mt-6">
            <Link to="/spectate" className="btn-neon hover:btn-neon-hover">
              Back to live games
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">
              Watching <span className="neon-cyan">@{game.username}</span>
            </h1>
            <div className="mt-2 flex gap-2">
              <span className={`chip ${game.state.mode === "walls" ? "chip-magenta" : "chip-cyan"}`}>
                {game.state.mode}
              </span>
              {game.isBot ? <span className="chip">bot</span> : <span className="chip chip-cyan">live player</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Score</div>
            <div className="text-4xl font-mono neon-yellow">{game.state.score}</div>
          </div>
        </div>
        <div className="flex justify-center">
          <SnakeBoard state={game.state} />
        </div>
        <div className="mt-6 text-center">
          <Link to="/spectate" className="btn-ghost-neon">
            ← All live games
          </Link>
        </div>
      </main>
    </div>
  );
}
