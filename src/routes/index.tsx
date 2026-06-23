import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Snake Arena — neon multiplayer snake" },
      {
        name: "description",
        content:
          "Choose walls or pass-through Snake, beat the leaderboard, and watch other players live.",
      },
      { property: "og:title", content: "Snake Arena" },
      {
        property: "og:description",
        content: "Neon multiplayer Snake with two modes, leaderboards, and live spectating.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="text-center">
          <span className="chip chip-magenta">v1 · neon arcade</span>
          <h1 className="mt-6 text-6xl md:text-7xl font-bold tracking-tight">
            <span className="neon-cyan">Slither.</span>{" "}
            <span className="neon-magenta">Score.</span>{" "}
            <span className="neon-yellow">Spectate.</span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-muted-foreground">
            Classic Snake reimagined as a live arena. Pick your physics, chase the leaderboard, and
            watch other players write their own game-over story in real time.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/play" className="btn-neon text-base hover:btn-neon-hover">
              Start playing →
            </Link>
            <Link to="/spectate" className="btn-ghost-neon">
              Watch live games
            </Link>
          </div>
        </section>

        <section className="mt-24 grid gap-5 md:grid-cols-3">
          <ModeCard
            tag="walls mode"
            title="One mistake. Game over."
            body="Hard borders. Tap a wall and the run ends — exactly like 1976."
            accent="magenta"
          />
          <ModeCard
            tag="pass-through"
            title="Wrap the world."
            body="Exits become entrances. Edges fold; only your tail can stop you."
            accent="cyan"
          />
          <ModeCard
            tag="multiplayer-ready"
            title="Live leaderboard & spectate."
            body="Top scores per mode, plus a wall of live snakes you can watch right now."
            accent="yellow"
          />
        </section>
      </main>
    </div>
  );
}

function ModeCard({
  tag,
  title,
  body,
  accent,
}: {
  tag: string;
  title: string;
  body: string;
  accent: "cyan" | "magenta" | "yellow";
}) {
  const accentClass =
    accent === "cyan" ? "neon-cyan" : accent === "magenta" ? "neon-magenta" : "neon-yellow";
  return (
    <div className="card-glow p-6">
      <span className={`chip ${accent === "cyan" ? "chip-cyan" : accent === "magenta" ? "chip-magenta" : ""}`}>
        {tag}
      </span>
      <h3 className={`mt-4 text-xl font-semibold ${accentClass}`}>{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
