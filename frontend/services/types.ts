import type { GameState, Mode } from "@/game/engine";

export interface User {
  id: string;
  username: string;
}

export interface ScoreEntry {
  id: string;
  userId: string;
  username: string;
  mode: Mode;
  score: number;
  createdAt: number;
}

export interface LiveGame {
  id: string;
  username: string;
  mode: Mode;
  state: GameState;
  isBot: boolean;
  updatedAt: number;
}

export type Unsubscribe = () => void;

export interface SnakeApi {
  // auth
  signUp(username: string, password: string): Promise<User>;
  signIn(username: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
  onAuthChange(cb: (user: User | null) => void): Unsubscribe;

  // scores
  submitScore(input: { mode: Mode; score: number }): Promise<ScoreEntry>;
  getLeaderboard(mode: Mode, limit?: number): Promise<ScoreEntry[]>;

  // live games
  publishGame(game: LiveGame): void;
  removeGame(gameId: string): void;
  listActiveGames(): LiveGame[];
  getGame(gameId: string): LiveGame | null;
  subscribeToActiveGames(cb: (games: LiveGame[]) => void): Unsubscribe;
  subscribeToGame(gameId: string, cb: (game: LiveGame | null) => void): Unsubscribe;
}
