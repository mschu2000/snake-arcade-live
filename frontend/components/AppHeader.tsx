import { Link } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";

export function AppHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-20 bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            <span className="neon-cyan">SNAKE</span>
            <span className="neon-magenta">::</span>
            <span className="text-foreground">ARENA</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/play"
            className="px-3 py-1.5 rounded-md hover:bg-secondary transition-colors"
            activeProps={{ className: "px-3 py-1.5 rounded-md bg-secondary text-neon-cyan" }}
          >
            Play
          </Link>
          <Link
            to="/leaderboard"
            className="px-3 py-1.5 rounded-md hover:bg-secondary transition-colors"
            activeProps={{ className: "px-3 py-1.5 rounded-md bg-secondary text-neon-cyan" }}
          >
            Leaderboard
          </Link>
          <Link
            to="/spectate"
            className="px-3 py-1.5 rounded-md hover:bg-secondary transition-colors"
            activeProps={{ className: "px-3 py-1.5 rounded-md bg-secondary text-neon-cyan" }}
          >
            Spectate
          </Link>
          {user ? (
            <div className="ml-3 flex items-center gap-2">
              <span className="chip chip-cyan">@{user.username}</span>
              <button onClick={() => signOut()} className="btn-ghost-neon text-xs">
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/auth" className="ml-3 btn-neon text-sm hover:btn-neon-hover">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
