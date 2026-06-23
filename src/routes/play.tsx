import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SnakeBoard } from "@/components/SnakeBoard";
import { createGame, keyToDirection, step, turn, type Mode } from "@/game/engine";
import { useAuth } from "@/context/AuthContext";
import { getApi } from "@/services/api";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play — Snake Arena" },
      { name: "description", content: "Play Snake in walls or pass-through mode. Arrow keys or WASD to move." },
      { property: "og:title", content: "Play — Snake Arena" },
      { property: "og:description", content: "Walls or pass-through. Pick your physics and play." },
    ],
  }),
  component: PlayPage,
});

const TICK_MS = 110;

function PlayPage() {
  const { user } = useAuth();
  const api = getApi();
  const [mode, setMode] = useState<Mode>("walls");
  const [state, setState] = useState(() => createGame({ mode: "walls" }));
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const gameIdRef = useRef<string>(`me-${Math.random().toString(36).slice(2, 8)}`);
  const stateRef = useRef(state);
  stateRef.current = state;

  // input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = keyToDirection(e.key);
      if (d) {
        e.preventDefault();
        setState((s) => turn(s, d));
      } else if (e.key === " ") {
        e.preventDefault();
        setRunning((r) => !r);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // game loop
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setState((s) => {
        if (!s.alive) return s;
        return step(s);
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // publish to live spectator feed
  useEffect(() => {
    if (!running || !user) return;
    api.publishGame({
      id: gameIdRef.current,
      username: user.username,
      mode: state.mode,
      state,
      isBot: false,
      updatedAt: Date.now(),
    });
  }, [state, running, user, api]);

  // unpublish on unmount
  useEffect(() => {
    const id = gameIdRef.current;
    return () => api.removeGame(id);
  }, [api]);

  // auto submit score on death
  useEffect(() => {
    if (!state.alive && !submitted && user && state.score > 0) {
      setSubmitted(true);
      api.submitScore({ mode: state.mode, score: state.score }).catch(() => {
        /* mock won't throw if signed-in */
      });
      api.removeGame(gameIdRef.current);
      setRunning(false);
    }
  }, [state.alive, state.score, state.mode, submitted, user, api]);

  const reset = useCallback(
    (m: Mode) => {
      setMode(m);
      setState(createGame({ mode: m }));
      setSubmitted(false);
      setRunning(false);
      api.removeGame(gameIdRef.current);
    },
    [api],
  );

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center">
          <SnakeBoard state={state} />
        </div>

        <aside className="space-y-6">
          <div className="card-glow p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">Score</h2>
              <span className="text-4xl font-mono neon-yellow">{state.score}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <span className={`chip ${state.mode === "walls" ? "chip-magenta" : "chip-cyan"}`}>
                {state.mode === "walls" ? "walls" : "pass-through"}
              </span>
              <span className="chip">length {state.snake.length}</span>
            </div>
          </div>

          <div className="card-glow p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground">Mode</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => reset("walls")}
                className={mode === "walls" ? "btn-neon" : "btn-ghost-neon"}
              >
                Walls
              </button>
              <button
                onClick={() => reset("wrap")}
                className={mode === "wrap" ? "btn-neon" : "btn-ghost-neon"}
              >
                Pass-through
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              {state.alive ? (
                <button
                  onClick={() => setRunning((r) => !r)}
                  className="btn-neon flex-1 hover:btn-neon-hover"
                >
                  {running ? "Pause" : state.tick === 0 ? "Start" : "Resume"}
                </button>
              ) : (
                <button onClick={() => reset(mode)} className="btn-neon flex-1 hover:btn-neon-hover">
                  Play again
                </button>
              )}
            </div>
            {!user ? (
              <p className="mt-4 text-xs text-muted-foreground">
                <Link to="/auth" className="neon-cyan underline">
                  Sign in
                </Link>{" "}
                to record scores on the leaderboard and broadcast your game.
              </p>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Playing as <span className="neon-cyan">@{user.username}</span> — scores auto-submit
                on game over.
              </p>
            )}
          </div>

          <div className="card-glow p-6 text-sm text-muted-foreground">
            <h3 className="text-sm uppercase tracking-wider text-foreground">Controls</h3>
            <ul className="mt-3 space-y-1 font-mono">
              <li>← ↑ → ↓ or WASD — move</li>
              <li>Space — pause / resume</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
