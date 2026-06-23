import type { SnakeApi } from "./types";
import { getApi as getMockApi } from "./mockApi";

// Single entry point for the entire app. Swap this to a real backend
// implementation later without touching consumers.
export function getApi(): SnakeApi {
  return getMockApi();
}

export type { SnakeApi, User, ScoreEntry, LiveGame } from "./types";
