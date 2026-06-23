import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Snake Arena" },
      { name: "description", content: "Sign in or create an account to submit scores and broadcast your game." },
      { property: "og:title", content: "Sign in — Snake Arena" },
      { property: "og:description", content: "Sign in or sign up to play Snake Arena." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") await signIn(username, password);
      else await signUp(username, password);
      await router.invalidate();
      navigate({ to: "/play" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="card-glow p-8">
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                mode === "signin" ? "btn-neon" : "btn-ghost-neon"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                mode === "signup" ? "btn-neon" : "btn-ghost-neon"
              }`}
            >
              Sign up
            </button>
          </div>
          <h1 className="text-2xl font-bold neon-cyan">
            {mode === "signin" ? "Welcome back" : "Create your handle"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin"
              ? "Pick up where you left off."
              : "Mock backend — credentials live in your browser only."}
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="input-neon focus:input-neon-focus mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                className="input-neon focus:input-neon-focus mt-1"
              />
            </label>
            {error ? (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="btn-neon hover:btn-neon-hover w-full disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
